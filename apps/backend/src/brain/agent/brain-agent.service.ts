import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
} as const;

const AGENT_CAPABILITIES: Capability[] = [
  ...(['brain.agent.run.get', 'brain.agent.run.cancel'] as const).map(topic => ({
    id: topic, actor: BRAIN_AGENT_ACTOR, topic,
    kinds: [topic.endsWith('get') ? 'query' : 'command'] as Capability['kinds'],
    mode: 'once' as const, enabled: true, online: true,
  })),
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
    let runError: string | undefined;
    try {
    this.publishRunState(runId);
    if (this.runs.cancelling(runId)) throw new Error('Agent run cancelled');

    const resolved = await this.llmService.resolveModel(this.readString(payload.profileName));
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
    const tools = await this.buildTools({
      toolPreset,
      codingCwd,
    });
    const { Agent } = await this.getAgentCore();
    if (this.runs.cancelling(runId)) throw new Error('Agent run cancelled');
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
    this.runs.attach(runId, () => agent.abort());

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

    // 从 MotorToolRunner 获取工具（通过 ToolAdapterService）
    const allTools = this.toolAdapterService.getAllTools(hooks);

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
