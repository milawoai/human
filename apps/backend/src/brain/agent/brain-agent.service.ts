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
import { ToolAdapterService } from '../../motor/motor-tool-runner/core/tool-adapter.service';

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
} as const;

const AGENT_CAPABILITIES: Capability[] = [
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

type ToolPreset = 'default' | 'coding' | 'coding_only';

@Injectable()
export class BrainAgentService implements OnModuleInit, InternalCommandHandler {
  private readonly logger = new Logger(BrainAgentService.name);

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly wsGateway: NeuralWsGateway,
    private readonly httpService: NeuralHttpService,
    private readonly llmService: LlmService,
    private readonly modelConfigService: ModelConfigService,
    private readonly providerAuthService: ProviderAuthService,
    private readonly sessionStore: AgentSessionStore,
    private readonly toolAdapterService: ToolAdapterService,
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
    const continueMode = Boolean(payload.continue);
    const userText = this.readString(payload.userText);
    if (!continueMode && !userText) {
      throw new Error('payload.userText is required when continue=false');
    }

    const resolved = await this.llmService.resolveModel(this.readString(payload.profileName));
    const persisted = this.sessionStore.loadSessionFile(sessionId);
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
    const agent = new Agent({
      initialState: {
        systemPrompt,
        model: resolved.model as Model<any>,
        messages: (persisted?.messages ?? []) as AgentMessage[],
        tools,
      },
      streamFn: (model, context, opts) =>
        this.llmService.streamSimple(model, context, opts),
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

    const events: AgentEvent[] = [];
    const requestId = message.id;
    agent.subscribe((event) => {
      events.push(event);
      this.publishEvent('brain.agent.run.event', {
        requestId,
        sessionId,
        event,
      });
    });

    if (continueMode) {
      await agent.continue();
    } else {
      await agent.prompt(userText as string);
    }
    await agent.waitForIdle();

    const messages = agent.state.messages as unknown[];
    const lastAssistant = this.findLastAssistant(messages);
    const persistedMeta = this.sessionStore.upsertSession({
      sessionId,
      profileName: resolved.profileName,
      systemPrompt,
      messages,
      requestId,
      eventCount: events.length,
      lastError: agent.state.errorMessage,
    });

    return {
      success: true,
      data: {
        sessionId,
        profileName: resolved.profileName,
        toolPreset,
        codingCwd,
        messageCount: messages.length,
        eventCount: events.length,
        lastError: agent.state.errorMessage,
        lastAssistant,
        sessionMeta: persistedMeta,
      },
    };
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
