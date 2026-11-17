import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { existsSync, statSync } from 'node:fs';
import * as path from 'node:path';
import type { Context, Model, ToolResultMessage } from '@earendil-works/pi-ai';
import type { AgentEvent, AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';
import type { BusMessage, Capability } from '../../neural/interfaces';
import type { InternalCommandHandler } from '../../neural/neural-http/neural-http.service';
import { NeuralHttpService } from '../../neural/neural-http/neural-http.service';
import { NeuralCoreService } from '../../neural/neural-core/neural-core.service';
import { NeuralWsGateway } from '../../neural/neural-ws/neural-ws.gateway';
import { LlmService } from '../language-center/llm.service';
import { ModelConfigService } from '../language-center/model-config.service';
import { ProviderAuthService } from '../language-center/provider-auth.service';
import { AgentSessionStore } from './agent-session.store';
import { AgentRunRegistry } from './agent-run-registry';
import { ToolAdapterService } from '../../motor/motor-tool-runner/core/tool-adapter.service';
import { BrainSpeechService } from '../speech/brain-speech.service';
import { speechSystemPrompt, splitSpeechSummary, speechDisplayMessage } from '../speech/speech-summary';
import {
  ToolRouterService,
  ToolRouterMode,
  PreparedAgentToolsResult,
} from '../basal-ganglia/tool-router.service';
import {
  isToolExecutionError,
  TOOL_SEARCH_NAME,
} from '../basal-ganglia/tool-search.agent-tool';

const BRAIN_AGENT_ACTOR = {
  actorId: 'brain-main',
  runtime: 'nest' as const,
  system: 'brain' as const,
  module: 'agent',
};

const TOPIC = {
  BRAIN_AGENT_RUN: 'brain.agent.run',
  BRAIN_AGENT_CODING_RUN: 'brain.agent.coding.run',
  BRAIN_AGENT_SESSION_GET: 'brain.agent.session.get',
  BRAIN_AGENT_SESSION_LIST: 'brain.agent.session.list',
  BRAIN_AGENT_RUN_GET: 'brain.agent.run.get',
  BRAIN_AGENT_RUN_CANCEL: 'brain.agent.run.cancel',
  BRAIN_AGENT_ROUTER_STATUS: 'brain.agent.router.status',
  BRAIN_AGENT_ROUTER_DECIDE: 'brain.agent.router.decide',
} as const;

const AGENT_CAPABILITIES: Capability[] = [
  ...(['brain.agent.run.get', 'brain.agent.run.cancel'] as const).map(topic => ({
    id: topic, actor: BRAIN_AGENT_ACTOR, topic,
    kinds: [topic.endsWith('get') ? 'query' : 'command'] as Capability['kinds'],
    mode: 'once' as const, enabled: true, online: true,
  })),
  {
    id: 'brain.agent.router.status',
    actor: BRAIN_AGENT_ACTOR,
    topic: TOPIC.BRAIN_AGENT_ROUTER_STATUS,
    kinds: ['query', 'command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.agent.router.decide',
    actor: BRAIN_AGENT_ACTOR,
    topic: TOPIC.BRAIN_AGENT_ROUTER_DECIDE,
    kinds: ['query', 'command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.agent.run',
    actor: BRAIN_AGENT_ACTOR,
    topic: TOPIC.BRAIN_AGENT_RUN,
    kinds: ['command'],
    mode: 'stream',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.agent.coding.run',
    actor: BRAIN_AGENT_ACTOR,
    topic: TOPIC.BRAIN_AGENT_CODING_RUN,
    kinds: ['command'],
    mode: 'stream',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.agent.session.get',
    actor: BRAIN_AGENT_ACTOR,
    topic: TOPIC.BRAIN_AGENT_SESSION_GET,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.agent.session.list',
    actor: BRAIN_AGENT_ACTOR,
    topic: TOPIC.BRAIN_AGENT_SESSION_LIST,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
];

const PI_AGENT_CORE_MODULE = '@earendil-works/pi-agent-core';
const dynamicImport = <T = unknown>(specifier: string): Promise<T> =>
  new Function('s', 'return import(s)')(specifier) as Promise<T>;

type ToolPreset = 'none' | 'default' | 'coding' | 'coding_only';

@Injectable()
export class BrainAgentService implements OnModuleInit, InternalCommandHandler {
  private readonly logger = new Logger(BrainAgentService.name);
  private runRegistry?: AgentRunRegistry;
  private get runs(): AgentRunRegistry { return this.runRegistry ??= new AgentRunRegistry(); }

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly wsGateway: NeuralWsGateway,
    private readonly httpService: NeuralHttpService,
    private readonly llmService: LlmService,
    private readonly modelConfigService: ModelConfigService,
    private readonly providerAuthService: ProviderAuthService,
    private readonly sessionStore: AgentSessionStore,
    private readonly toolAdapterService: ToolAdapterService,
    private readonly speechService: BrainSpeechService,
    @Optional() private readonly toolRouter?: ToolRouterService,
  ) {}

  onModuleInit() {
    this.coreService.registerInternalActor(BRAIN_AGENT_ACTOR);
    this.coreService.registerCapabilities(AGENT_CAPABILITIES);
    this.httpService.registerCommandHandler(this);
    this.logger.log(
      `BrainAgentService 已注册，session.db=${this.sessionStore.getDbPath()}`,
    );
  }

  canHandle(topic: string): boolean {
    return topic.startsWith('brain.agent');
  }

  async handleCommand(
    message: BusMessage,
  ): Promise<{ success: boolean; data?: any; msg?: string }> {
    try {
      switch (message.topic) {
        case TOPIC.BRAIN_AGENT_RUN:
          return await this.handleAgentRun(message);
        case TOPIC.BRAIN_AGENT_CODING_RUN:
          return await this.handleAgentRun(message, {
            forcedToolPreset: 'coding_only',
          });
        case TOPIC.BRAIN_AGENT_SESSION_GET:
          return this.handleSessionGet(message);
        case TOPIC.BRAIN_AGENT_SESSION_LIST:
          return this.handleSessionList(message);
        case TOPIC.BRAIN_AGENT_RUN_GET:
        case TOPIC.BRAIN_AGENT_RUN_CANCEL:
          return this.handleRunControl(message);
        case TOPIC.BRAIN_AGENT_ROUTER_STATUS:
          return this.handleRouterStatus(message);
        case TOPIC.BRAIN_AGENT_ROUTER_DECIDE:
          return await this.handleRouterDecide(message);
        default:
          return { success: false, msg: `BrainAgent 无法处理 topic: ${message.topic}` };
      }
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleAgentRun(
    message: BusMessage,
    options?: {
      forcedToolPreset?: ToolPreset;
    },
  ) {
    const payload = this.ensureObject(message.payload);
    const sessionId = this.readString(payload.sessionId) ?? crypto.randomUUID();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new Error('payload.sessionId is invalid');
    const continueMode = Boolean(payload.continue);
    const userText = this.readString(payload.userText);
    if (!continueMode && !userText) {
      throw new Error('payload.userText is required when continue=false');
    }

    const runId = this.readString(payload.runId) ?? message.id;
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(runId)) throw new Error('payload.runId is invalid');
    this.runs.begin(runId, sessionId); // Acquire before any async initialization.
    const runAbort = new AbortController();
    let activeAgent: { abort: () => void } | undefined;
    this.runs.attach(runId, () => {
      runAbort.abort();
      activeAgent?.abort();
    });
    let runError: string | undefined;
    try {
    this.publishRunState(runId);
    if (this.runs.cancelling(runId) || runAbort.signal.aborted) throw new Error('Agent run cancelled');

    const resolved = await this.llmService.resolveModel(this.readString(payload.profileName));
    if (this.runs.cancelling(runId) || runAbort.signal.aborted) throw new Error('Agent run cancelled');
    const persisted = this.sessionStore.loadSessionFile(sessionId);
    const speechSummaryEnabled = this.readBoolean(payload.speechSummaryEnabled) ?? persisted?.speechSummaryEnabled === true;
    const systemPrompt =
      this.readString(payload.systemPrompt) ??
      persisted?.systemPrompt ??
      'You are a helpful assistant.';

    const toolPreset = this.resolveToolPreset(
      options?.forcedToolPreset,
      this.readString(payload.toolPreset),
      this.readBoolean(payload.enableCodingTools),
    );
    const codingCwd =
      toolPreset === 'default'
        ? undefined
        : this.resolveCodingCwd(this.readString(payload.cwd));
    const routerModeRaw = this.readString(payload.routerMode);
    const routerMode: ToolRouterMode | undefined =
      routerModeRaw === 'off' || routerModeRaw === 'shadow' || routerModeRaw === 'active'
        ? routerModeRaw
        : undefined;
    const priorMessages = (persisted?.messages ?? []) as unknown[];
    const priorMessageCount = priorMessages.length;
    const contextSummary = this.extractRoutingContextSummary(
      priorMessages,
      this.readString(payload.contextSummary),
    );
    const { tools, preparedRouting } = await this.buildToolsWithRouting({
      toolPreset,
      codingCwd,
      userText: continueMode ? undefined : userText,
      contextSummary: continueMode ? undefined : contextSummary,
      routerMode,
      signal: runAbort.signal,
    });
    const { Agent } = await this.getAgentCore();
    if (this.runs.cancelling(runId) || runAbort.signal.aborted) throw new Error('Agent run cancelled');
    const speechInstruction: AgentMessage = {
      role: 'system', content: speechSystemPrompt('', true), timestamp: Date.now(),
    };
    const agent = new Agent({
      initialState: {
        systemPrompt,
        model: resolved.model as Model<any>,
        messages: (persisted?.messages ?? []) as AgentMessage[],
        tools,
      },
      streamFn: (model, context, opts) =>
        this.llmService.streamSimple(model, context, opts),
      // Request-only context: works with restored Pi system messages without
      // persisting the narration instruction or changing continue() semantics.
      transformContext: speechSummaryEnabled ? async (messages) => [...messages, speechInstruction] : undefined,
      getApiKey: async () =>
        await this.providerAuthService.resolveApiKey(
          resolved.profileName,
          resolved.profile,
        ),
      toolExecution:
        this.readString(payload.toolExecution) === 'sequential'
          ? 'sequential'
          : 'parallel',
    });
    activeAgent = agent;
    if (this.runs.cancelling(runId) || runAbort.signal.aborted) {
      agent.abort();
      throw new Error('Agent run cancelled');
    }

    const events: AgentEvent[] = [];
    const requestId = runId;
    agent.subscribe((event) => {
      events.push(event);
      const publicEvent: any = speechSummaryEnabled ? { ...event } : event;
      if (speechSummaryEnabled) {
        if ('message' in publicEvent) publicEvent.message = speechDisplayMessage(publicEvent.message);
        if (Array.isArray(publicEvent.messages)) publicEvent.messages = publicEvent.messages.map(speechDisplayMessage);
        // Raw deltas contain the transport block; the panel uses sanitized snapshots.
        delete publicEvent.assistantMessageEvent;
      }
      this.publishEvent('brain.agent.run.event', {
        requestId,
        sessionId,
        event: publicEvent,
      });
    });

    if (continueMode) {
      await agent.continue();
    } else {
      await agent.prompt(userText as string);
    }
    await agent.waitForIdle();
    runError = agent.state.errorMessage;

    const rawMessages = agent.state.messages as unknown[];
    const rawLast = rawMessages[rawMessages.length - 1] as any;
    const finalText = rawLast?.role === 'assistant' && rawLast.stopReason === 'stop' && !agent.state.errorMessage
      ? (rawLast.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('') : '';
    const { summary } = splitSpeechSummary(finalText, speechSummaryEnabled);
    const history = rawMessages.filter(m => m !== speechInstruction);
    const newMessages = history.slice(priorMessageCount);
    this.toolRouter?.recordRunOutcome({
      sessionId,
      requestId,
      userText: continueMode ? undefined : userText,
      prepared: preparedRouting,
      newMessages,
    });
    const messages = speechSummaryEnabled ? history.map(speechDisplayMessage) : history;
    const lastAssistant = this.findLastAssistant(messages);
    const persistedMeta = this.sessionStore.upsertSession({
      sessionId,
      profileName: resolved.profileName,
      systemPrompt,
      speechSummaryEnabled,
      messages,
      requestId,
      eventCount: events.length,
      lastError: agent.state.errorMessage,
    });
    let speech = summary && !this.runs.cancelling(runId) ? await this.speechService.synthesize(summary, sessionId) : undefined;
    if (this.runs.cancelling(runId)) speech = undefined;

    return {
      success: true,
      data: {
        runId,
        runStatus: this.runs.cancelling(runId) ? 'cancelled' : runError ? 'failed' : 'succeeded',
        sessionId,
        profileName: resolved.profileName,
        toolPreset,
        codingCwd,
        messageCount: messages.length,
        eventCount: events.length,
        lastError: agent.state.errorMessage,
        lastAssistant,
        sessionMeta: persistedMeta,
        speechSummaryEnabled,
        speech,
        toolRouting: preparedRouting?.decision,
      },
    };
    } catch (error) {
      runError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.runs.finish(runId, runError);
      this.publishRunState(runId);
    }
  }

  private handleRunControl(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const runId = this.readString(payload.runId);
    const sessionId = this.readString(payload.sessionId);
    if (!runId && !sessionId) throw new Error('payload.runId or sessionId is required');
    let run = this.runs.get(runId, sessionId);
    if (message.topic === TOPIC.BRAIN_AGENT_RUN_CANCEL) {
      if (!runId) throw new Error('取消必须指定 runId，防止取消后续新任务');
      if (run) { run = this.runs.cancel(runId); this.publishRunState(runId); }
    }
    return { success: true, data: { instanceId: this.runs.instanceId, status: run?.status ?? 'unknown', run } };
  }

  private publishRunState(runId: string): void {
    const run = this.runs.get(runId);
    // Observation failures must never leak the session lock or alter execution results.
    try {
      if (run) this.publishEvent('brain.agent.run.state', { instanceId: this.runs.instanceId, run });
    } catch (error) { this.logger?.warn(`Agent 状态通知失败: ${String(error)}`); }
  }

  private handleSessionGet(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const sessionId = this.readString(payload.sessionId);
    if (!sessionId) {
      throw new Error('payload.sessionId is required');
    }

    const includeMessages =
      this.readBoolean(payload.includeMessages) ?? true;
    const session = this.sessionStore.getSession(sessionId, { includeMessages });
    if (!session) {
      return { success: false, msg: `session "${sessionId}" not found` };
    }

    return {
      success: true,
      data: session,
    };
  }

  private handleSessionList(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const limit = this.readNumber(payload.limit) ?? 20;
    return {
      success: true,
      data: {
        sessions: this.sessionStore.listSessions(limit),
      },
    };
  }

  private handleRouterStatus(message: BusMessage) {
    if (!this.toolRouter) {
      return { success: false, msg: 'ToolRouterService 未启用' };
    }
    const payload = this.ensureObject(message.payload);
    const hasMode = payload.mode !== undefined;
    const hasSetMode = payload.setMode !== undefined;
    if (
      hasMode &&
      hasSetMode &&
      this.readString(payload.mode) !== this.readString(payload.setMode)
    ) {
      throw new Error('payload.mode and payload.setMode conflict');
    }

    let nextMode: ToolRouterMode | undefined;
    if (hasMode || hasSetMode) {
      const rawMode = hasMode ? payload.mode : payload.setMode;
      const modeStr = typeof rawMode === 'string' ? rawMode.trim() : '';
      if (modeStr !== 'off' && modeStr !== 'shadow' && modeStr !== 'active') {
        throw new Error('payload.mode must be one of: off, shadow, active');
      }
      nextMode = modeStr;
    }

    let nextTopK: number | undefined;
    if (payload.topK !== undefined) {
      const val = Number(payload.topK);
      if (!Number.isFinite(val) || !Number.isInteger(val) || val < 1 || val > 64) {
        throw new Error('payload.topK must be an integer between 1 and 64');
      }
      nextTopK = val;
    }

    let nextThreshold: number | undefined;
    if (payload.threshold !== undefined) {
      const val = Number(payload.threshold);
      if (!Number.isFinite(val) || val < 0 || val > 1) {
        throw new Error('payload.threshold must be a number between 0 and 1');
      }
      nextThreshold = val;
    }

    let nextMinCandidates: number | undefined;
    if (payload.minCandidates !== undefined) {
      const val = Number(payload.minCandidates);
      if (!Number.isFinite(val) || !Number.isInteger(val) || val < 1 || val > 100) {
        throw new Error('payload.minCandidates must be an integer between 1 and 100');
      }
      nextMinCandidates = val;
    }

    let nextRouteTimeoutMs: number | undefined;
    if (payload.routeTimeoutMs !== undefined) {
      const val = Number(payload.routeTimeoutMs);
      if (!Number.isFinite(val) || !Number.isInteger(val) || val < 20 || val > 120000) {
        throw new Error('payload.routeTimeoutMs must be an integer between 20 and 120000');
      }
      nextRouteTimeoutMs = val;
    }

    if (
      nextMode !== undefined ||
      nextTopK !== undefined ||
      nextThreshold !== undefined ||
      nextMinCandidates !== undefined ||
      nextRouteTimeoutMs !== undefined
    ) {
      this.toolRouter.setConfig({
        mode: nextMode,
        topK: nextTopK,
        threshold: nextThreshold,
        minCandidates: nextMinCandidates,
        routeTimeoutMs: nextRouteTimeoutMs,
      });
    }

    return {
      success: true,
      data: this.toolRouter.getStatusAndLogs({
        limit: this.readNumber(payload.limit) ?? 20,
        onlyFalseNegatives: this.readBoolean(payload.onlyFalseNegatives),
        sessionId: this.readString(payload.sessionId),
      }),
    };
  }

  private async handleRouterDecide(message: BusMessage) {
    if (!this.toolRouter) {
      return { success: false, msg: 'ToolRouterService 未启用' };
    }
    const payload = this.ensureObject(message.payload);
    const userText = this.readString(payload.userText);
    if (!userText) {
      throw new Error('payload.userText is required');
    }
    const allTools = this.toolAdapterService
      .getAllTools()
      .filter((t) => !t.name.endsWith('.router.decide') && t.name !== TOOL_SEARCH_NAME);
    const customCandidates = Array.isArray(payload.candidates)
      ? payload.candidates
      : allTools.map((t) => ({
          toolId: t.name,
          category: t.name.includes('.') ? t.name.split('.')[0] : undefined,
          description: t.description || t.label || t.name,
        }));
    let decideTopK: number | undefined;
    if (payload.topK !== undefined) {
      const val = Number(payload.topK);
      if (!Number.isFinite(val) || !Number.isInteger(val) || val < 1 || val > 64) {
        throw new Error('payload.topK must be an integer between 1 and 64');
      }
      decideTopK = val;
    }

    let decideThreshold: number | undefined;
    if (payload.threshold !== undefined) {
      const val = Number(payload.threshold);
      if (!Number.isFinite(val) || val < 0 || val > 1) {
        throw new Error('payload.threshold must be a number between 0 and 1');
      }
      decideThreshold = val;
    }

    const decision = await this.toolRouter.decide({
      userText,
      contextSummary: this.readString(payload.contextSummary),
      candidates: customCandidates,
      topK: decideTopK,
      threshold: decideThreshold,
    });
    return {
      success: true,
      data: decision,
    };
  }

  private async buildToolsWithRouting(options: {
    toolPreset: ToolPreset;
    codingCwd?: string;
    userText?: string;
    contextSummary?: string;
    routerMode?: ToolRouterMode;
    signal?: AbortSignal;
  }): Promise<{ tools: AgentTool[]; preparedRouting?: PreparedAgentToolsResult }> {
    const baseTools = await this.buildTools({
      toolPreset: options.toolPreset,
      codingCwd: options.codingCwd,
    });
    if (options.toolPreset === 'none' || !this.toolRouter) {
      return { tools: baseTools };
    }
    // coding_only 为显式硬限定，不走动态工具路由过滤
    if (options.toolPreset === 'coding_only') {
      return { tools: baseTools };
    }
    const preparedRouting = await this.toolRouter.prepareToolsForRun({
      userText: options.userText,
      contextSummary: options.contextSummary,
      allTools: baseTools,
      mode: options.routerMode,
      signal: options.signal,
    });
    return {
      tools: preparedRouting.tools,
      preparedRouting,
    };
  }

  /**
   * 从当前会话最近几条历史消息中提取供工具路由参考的轻量前文摘要（严格与 TTS 播报摘要区分）
   */
  private extractRoutingContextSummary(
    priorMessages: unknown[],
    explicitSummary?: string,
  ): string | undefined {
    if (explicitSummary?.trim()) {
      return explicitSummary.trim().slice(0, 500);
    }
    if (!Array.isArray(priorMessages) || priorMessages.length === 0) {
      return undefined;
    }

    const callIdToToolName = new Map<string, string>();
    for (const msg of priorMessages) {
      const m = msg as Record<string, any>;
      if (!m || typeof m !== 'object' || m.role !== 'assistant' || !Array.isArray(m.content)) {
        continue;
      }
      for (const block of m.content) {
        if (
          block &&
          block.type === 'toolCall' &&
          typeof block.id === 'string' &&
          typeof block.name === 'string'
        ) {
          callIdToToolName.set(block.id, block.name);
        }
      }
    }

    const recentSlice = priorMessages.slice(-8);
    const recentUserTexts: string[] = [];
    const recentSucceededTools: string[] = [];

    for (const msg of recentSlice) {
      const m = msg as Record<string, any>;
      if (!m || typeof m !== 'object') continue;
      if (m.role === 'user') {
        const text =
          typeof m.content === 'string'
            ? m.content.trim()
            : Array.isArray(m.content)
              ? m.content
                  .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
                  .map((b: any) => b.text.trim())
                  .join(' ')
              : '';
        if (text) {
          recentUserTexts.push(text.slice(0, 140));
        }
      } else if (m.role === 'toolResult') {
        if (isToolExecutionError(m)) continue;
        const toolName =
          typeof m.toolName === 'string' && m.toolName
            ? m.toolName
            : typeof m.toolCallId === 'string'
              ? callIdToToolName.get(m.toolCallId)
              : undefined;
        if (
          toolName &&
          toolName !== TOOL_SEARCH_NAME &&
          !recentSucceededTools.includes(toolName)
        ) {
          recentSucceededTools.push(toolName);
        }
      }
    }

    const parts: string[] = [];
    if (recentUserTexts.length > 0) {
      parts.push(`上一轮用户：${recentUserTexts.slice(-2).join(' / ')}`);
    }
    if (recentSucceededTools.length > 0) {
      parts.push(`上一轮成功调用工具：${recentSucceededTools.slice(-4).join(', ')}`);
    }
    if (parts.length === 0) {
      return undefined;
    }
    return parts.join(' | ').slice(0, 500);
  }

  private async buildTools(options: {
    toolPreset: ToolPreset;
    codingCwd?: string;
  }): Promise<AgentTool[]> {
    if (options.toolPreset === 'none') return [];
    // 注入当前工作目录到 context metadata，供 builtin 工具使用
    const hooks = {
      beforeToolCall: async (context: any) => {
        context.metadata = { ...context.metadata, cwd: options.codingCwd || process.cwd() };
        return undefined;
      },
    };

    // 从 MotorToolRunner 获取工具（通过 ToolAdapterService），排除内部 router.decide
    const allTools = this.toolAdapterService
      .getAllTools(hooks)
      .filter((t) => !t.name.endsWith('.router.decide') && t.name !== TOOL_SEARCH_NAME);

    if (options.toolPreset === 'default') {
      // 默认模式：返回所有已注册且启用的 Motor 工具
      return allTools;
    }

    if (options.toolPreset === 'coding_only') {
      // coding_only 模式：仅返回 coding 相关的工具和 session 工具
      return allTools.filter(t => 
        t.name.startsWith('pi-coding-tools.') || 
        t.name.startsWith('system-session-tools.')
      );
    }

    // coding 模式：返回所有工具
    return allTools;
  }

  private async getAgentCore(): Promise<typeof import('@earendil-works/pi-agent-core')> {
    return dynamicImport<typeof import('@earendil-works/pi-agent-core')>(
      PI_AGENT_CORE_MODULE,
    );
  }

  private resolveToolPreset(
    forcedToolPreset: ToolPreset | undefined,
    requestedToolPreset: string | undefined,
    enableCodingTools: boolean | undefined,
  ): ToolPreset {
    if (forcedToolPreset) return forcedToolPreset;
    if (requestedToolPreset === 'none') return 'none';
    if (requestedToolPreset === 'coding') return 'coding';
    if (requestedToolPreset === 'coding_only') return 'coding_only';
    if (enableCodingTools) return 'coding';
    return 'default';
  }

  private resolveCodingCwd(rawCwd: string | undefined): string {
    const defaultCwd = process.cwd();
    const resolved = rawCwd
      ? path.isAbsolute(rawCwd)
        ? rawCwd
        : path.resolve(defaultCwd, rawCwd)
      : defaultCwd;
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      throw new Error(`payload.cwd is not a directory: ${resolved}`);
    }
    return resolved;
  }

  private publishEvent(topic: string, payload: any): void {
    const eventMessage: BusMessage = {
      id: crypto.randomUUID(),
      kind: 'event',
      topic,
      source: BRAIN_AGENT_ACTOR,
      timestamp: Date.now(),
      payload,
    };

    const subscribers = this.coreService.findSubscribers(topic, 'event');
    for (const sub of subscribers) {
      this.wsGateway.sendToConnection(sub.connectionId, 'message', eventMessage);
    }
  }

  private findLastAssistant(messages: unknown[]): ToolResultMessage | Record<string, unknown> | undefined {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i] as Record<string, any>;
      if (msg && typeof msg === 'object' && msg.role === 'assistant') {
        return msg;
      }
    }
    return undefined;
  }

  private ensureObject(value: unknown): Record<string, any> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, any>;
    }
    return {};
  }

  private readString(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim()) return value;
    return undefined;
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
  }

  private readBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    return undefined;
  }
}
