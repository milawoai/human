import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Context } from '@earendil-works/pi-ai';
import type { BusMessage, Capability } from '../../neural/interfaces';
import type { InternalCommandHandler } from '../../neural/neural-http/neural-http.service';
import { NeuralHttpService } from '../../neural/neural-http/neural-http.service';
import { NeuralCoreService } from '../../neural/neural-core/neural-core.service';
import { NeuralWsGateway } from '../../neural/neural-ws/neural-ws.gateway';
import { LlmService } from '../language-center/llm.service';
import { ModelConfigService } from '../language-center/model-config.service';
import { ProviderAuthService } from '../language-center/provider-auth.service';
import { MemoryService } from '../hippocampus/memory.service';
import { BrainSpeechService } from '../speech/brain-speech.service';
import { speechSystemPrompt, splitSpeechSummary, visibleSpeechAnswer } from '../speech/speech-summary';

/** 带超时的 JSON GET（模型配置可视化用：通道 /models、Ollama /api/tags） */
async function fetchJsonWithTimeout(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 8000,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** OpenAI 兼容 /models → 模型 id 列表（排序去重） */
async function fetchOpenAICompatModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const json = await fetchJsonWithTimeout(`${baseUrl.replace(/\/+$/, '')}/models`, headers);
  const ids: string[] = Array.isArray(json?.data)
    ? json.data.map((m: { id?: string }) => String(m.id ?? '')).filter(Boolean)
    : [];
  return Array.from(new Set<string>(ids)).sort();
}

const BRAIN_CORTEX_ACTOR = {
  actorId: 'brain-main',
  runtime: 'nest' as const,
  system: 'brain' as const,
  module: 'cortex',
};

const TOPIC = {
  BRAIN_CORTEX_CHAT_COMPLETE: 'brain.cortex.chat.complete',
  BRAIN_CORTEX_CHAT_STREAM: 'brain.cortex.chat.stream',
  BRAIN_CORTEX_REWRITE_REQUESTED: 'brain.cortex.rewrite.requested',
  BRAIN_CORTEX_REWRITE_COMPLETED: 'brain.cortex.rewrite.completed',
  BRAIN_CORTEX_ASK_REQUESTED: 'brain.cortex.ask.requested',
  BRAIN_CORTEX_ANSWER_STREAM_THINK: 'brain.cortex.answer.stream.think',
  BRAIN_CORTEX_ANSWER_STREAM_CHUNK: 'brain.cortex.answer.stream.chunk',
  BRAIN_CORTEX_ANSWER_COMPLETED: 'brain.cortex.answer.completed',
  BRAIN_CORTEX_ANSWER_FAILED: 'brain.cortex.answer.failed',
  BRAIN_LANGUAGE_MODELS_LIST: 'brain.language.models.list',
  BRAIN_LANGUAGE_MODELS_VALIDATE: 'brain.language.models.validate',
  BRAIN_LANGUAGE_MODEL_SWITCH: 'brain.language.model.switch',
  BRAIN_LANGUAGE_PROVIDERS_REMOTE_MODELS: 'brain.language.providers.remote_models',
  BRAIN_LANGUAGE_PROVIDERS_PROBE: 'brain.language.providers.probe',
  BRAIN_LANGUAGE_OAUTH_PROVIDERS: 'brain.language.oauth.providers',
  BRAIN_LANGUAGE_OAUTH_LOGIN: 'brain.language.oauth.login',
} as const;

const CORTEX_CAPABILITIES: Capability[] = [
  {
    id: 'brain.cortex.chat.complete',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_CORTEX_CHAT_COMPLETE,
    kinds: ['command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.cortex.chat.stream',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_CORTEX_CHAT_STREAM,
    kinds: ['command'],
    mode: 'stream',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.cortex.rewrite.requested',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_CORTEX_REWRITE_REQUESTED,
    kinds: ['command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.cortex.ask.requested',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_CORTEX_ASK_REQUESTED,
    kinds: ['command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.language.models.list',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_LANGUAGE_MODELS_LIST,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.language.models.validate',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_LANGUAGE_MODELS_VALIDATE,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.language.model.switch',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_LANGUAGE_MODEL_SWITCH,
    kinds: ['command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.language.providers.remote_models',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_LANGUAGE_PROVIDERS_REMOTE_MODELS,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.language.providers.probe',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_LANGUAGE_PROVIDERS_PROBE,
    kinds: ['command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.language.oauth.providers',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_LANGUAGE_OAUTH_PROVIDERS,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.language.oauth.login',
    actor: BRAIN_CORTEX_ACTOR,
    topic: TOPIC.BRAIN_LANGUAGE_OAUTH_LOGIN,
    kinds: ['command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
];

@Injectable()
export class BrainCortexService implements OnModuleInit, InternalCommandHandler {
  private readonly logger = new Logger(BrainCortexService.name);

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly wsGateway: NeuralWsGateway,
    private readonly httpService: NeuralHttpService,
    private readonly llmService: LlmService,
    private readonly modelConfigService: ModelConfigService,
    private readonly providerAuthService: ProviderAuthService,
    private readonly memoryService: MemoryService,
    private readonly speechService: BrainSpeechService,
  ) {}

  onModuleInit() {
    this.coreService.registerInternalActor(BRAIN_CORTEX_ACTOR);
    this.coreService.registerCapabilities(CORTEX_CAPABILITIES);
    this.httpService.registerCommandHandler(this);
    this.logger.log('BrainCortexService 已注册为内部命令处理器');
  }

  canHandle(topic: string): boolean {
    return (
      topic.startsWith('brain.cortex.chat') ||
      topic.startsWith('brain.cortex.rewrite') ||
      topic.startsWith('brain.cortex.ask') ||
      topic.startsWith('brain.language.models') ||
      topic.startsWith('brain.language.model.switch') ||
      topic.startsWith('brain.language.providers') ||
      topic.startsWith('brain.language.oauth')
    );
  }

  async handleCommand(
    message: BusMessage,
  ): Promise<{ success: boolean; data?: any; msg?: string }> {
    try {
      switch (message.topic) {
        case TOPIC.BRAIN_CORTEX_CHAT_COMPLETE:
          return await this.handleChatComplete(message);
        case TOPIC.BRAIN_CORTEX_CHAT_STREAM:
          return await this.handleChatStream(message);
        case TOPIC.BRAIN_CORTEX_REWRITE_REQUESTED:
          return await this.handleRewriteRequested(message);
        case TOPIC.BRAIN_CORTEX_ASK_REQUESTED:
          return await this.handleAskRequested(message);
        case TOPIC.BRAIN_LANGUAGE_MODELS_LIST:
          return this.handleModelsList();
        case TOPIC.BRAIN_LANGUAGE_MODELS_VALIDATE:
          return this.handleModelsValidate(message);
        case TOPIC.BRAIN_LANGUAGE_MODEL_SWITCH:
          return this.handleModelSwitch(message);
        case TOPIC.BRAIN_LANGUAGE_PROVIDERS_REMOTE_MODELS:
          return await this.handleProvidersRemoteModels(message);
        case TOPIC.BRAIN_LANGUAGE_PROVIDERS_PROBE:
          return await this.handleProvidersProbe(message);
        case TOPIC.BRAIN_LANGUAGE_OAUTH_PROVIDERS:
          return await this.handleOAuthProviders();
        case TOPIC.BRAIN_LANGUAGE_OAUTH_LOGIN:
          return await this.handleOAuthLogin(message);
        default:
          return { success: false, msg: `BrainCortex 无法处理 topic: ${message.topic}` };
      }
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleChatComplete(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const { providerOptions, stripThinking } = this.parseChatOptions(payload);
    const context = await this.resolveContext(payload)
    const response = await this.llmService.complete({
      profileName: this.readString(payload.profileName),
      context,
      options: providerOptions,
      timeoutMs: this.readNumber(payload.timeoutMs),
      retryAttempts: this.readNumber(payload.retryAttempts),
    });

    return {
      success: true,
      data: stripThinking
        ? this.stripThinkingFromAssistantMessage(response)
        : response,
    };
  }

  private async handleChatStream(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const { providerOptions, stripThinking } = this.parseChatOptions(payload);
    const stream = await this.llmService.stream({
      profileName: this.readString(payload.profileName),
      context: await this.resolveContext(payload),
      options: providerOptions,
      timeoutMs: this.readNumber(payload.timeoutMs),
    });

    for await (const event of stream) {
      this.publishEvent(`brain.cortex.chat.stream.${event.type}`, {
        requestId: message.id,
        event,
      });
    }
    const finalMessage = await stream.result();

    return {
      success: true,
      data: {
        requestId: message.id,
        message: stripThinking
          ? this.stripThinkingFromAssistantMessage(finalMessage)
          : finalMessage,
      },
    };
  }

  private async handleRewriteRequested(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const originalText =
      this.readString(payload.text) ??
      this.readString(payload.userText) ??
      '';
    if (!originalText) {
      return { success: false, msg: 'payload.text is required for rewrite' };
    }

    const rewriteContext: Context = {
      systemPrompt: [
        '你是书面化改写助手。',
        '任务：将用户口语问题改写为简洁、自然、语义不变的书面语问句。',
        '要求：',
        '1) 不引入新事实',
        '2) 不省略关键约束',
        '3) 仅输出改写后的单句问题，不要解释',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: originalText,
          timestamp: Date.now(),
        },
      ],
    };

    const response = await this.llmService.complete({
      profileName: this.readString(payload.profileName),
      context: rewriteContext,
      options: this.ensureObject(payload.options),
      timeoutMs: this.readNumber(payload.timeoutMs),
      retryAttempts: this.readNumber(payload.retryAttempts),
    });

    const normalizedQuestion = this.extractAssistantText(response).trim();
    const requestId =
      this.readString(payload.requestId) ??
      this.readString(payload.sessionId) ??
      message.id;

    const rewriteCompleted = {
      requestId,
      originalText,
      normalizedQuestion,
      source: payload.source ?? 'brain.cortex',
    };
    this.logger.log(
      `[rewrite] completed requestId=${requestId}, normalizedQuestion=${normalizedQuestion}`,
    );
    this.publishEvent(TOPIC.BRAIN_CORTEX_REWRITE_COMPLETED, rewriteCompleted);

    return {
      success: true,
      data: rewriteCompleted,
    };
  }

  private async handleAskRequested(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const speechEnabled = payload.speechSummaryEnabled === true;
    const confirmedQuestion =
      this.readString(payload.confirmedQuestion) ??
      this.readString(payload.text) ??
      '';
    if (!confirmedQuestion) {
      return { success: false, msg: 'payload.confirmedQuestion is required' };
    }

    const requestId =
      this.readString(payload.requestId) ??
      this.readString(payload.sessionId) ??
      message.id;

    try {
      const context = await this.attachMemoryContext(
        {
          messages: [
            {
              role: 'user',
              content: confirmedQuestion,
              timestamp: Date.now(),
            },
          ],
        },
        {
          ...payload,
          useMemory: payload.useMemory ?? true,
          userText: confirmedQuestion,
        },
      );

      if (speechEnabled) context.systemPrompt = speechSystemPrompt(context.systemPrompt ?? '', true);
      const stream = await this.llmService.stream({
        profileName: this.readString(payload.profileName),
        context,
        options: this.ensureObject(payload.options),
        timeoutMs: this.readNumber(payload.timeoutMs),
      });

      let parserMode: 'think' | 'answer' = 'answer';
      let parseBuffer = '';
      let fullThink = '';
      let fullAnswer = '';
      let emittedAnswer = '';
      const publishAnswer = () => {
        const visible = speechEnabled ? visibleSpeechAnswer(fullAnswer) : fullAnswer;
        const content = visible.slice(emittedAnswer.length);
        emittedAnswer = visible;
        if (content) this.publishEvent(TOPIC.BRAIN_CORTEX_ANSWER_STREAM_CHUNK, {
          requestId, content, source: payload.source ?? 'brain.cortex',
        });
      };

      for await (const event of stream) {
        if (event.type === 'thinking_delta') {
          fullThink += event.delta;
          this.publishEvent(TOPIC.BRAIN_CORTEX_ANSWER_STREAM_THINK, {
            requestId, content: event.delta, source: payload.source ?? 'brain.cortex',
          });
          continue;
        }
        const delta = this.extractTextFromStreamEvent(event);
        if (!delta) continue;
        const parsed = this.consumeTextByThinkTags(parseBuffer + delta, parserMode);
        parseBuffer = parsed.buffer;
        parserMode = parsed.mode;

        if (parsed.thinkDelta) {
          fullThink += parsed.thinkDelta;
          this.publishEvent(TOPIC.BRAIN_CORTEX_ANSWER_STREAM_THINK, {
            requestId,
            content: parsed.thinkDelta,
            source: payload.source ?? 'brain.cortex',
          });
        }
        if (parsed.answerDelta) {
          fullAnswer += parsed.answerDelta;
          publishAnswer();
        }
      }

      if (parseBuffer) {
        if (parserMode === 'think') {
          fullThink += parseBuffer;
          this.publishEvent(TOPIC.BRAIN_CORTEX_ANSWER_STREAM_THINK, {
            requestId,
            content: parseBuffer,
            source: payload.source ?? 'brain.cortex',
          });
        } else {
          fullAnswer += parseBuffer;
          publishAnswer();
        }
      }

      const finalMessage = await stream.result();
      const finalRawText = this.extractAssistantText(finalMessage).trim();
      const thinkText = fullThink.trim() || this.extractThinkText(finalRawText);
      const { answer: answerText, summary } = splitSpeechSummary(
        this.stripThinkingTags(finalRawText) || fullAnswer.trim(), speechEnabled,
      );

      this.publishEvent(TOPIC.BRAIN_CORTEX_ANSWER_COMPLETED, {
        requestId,
        confirmedQuestion,
        answer: answerText,
        source: payload.source ?? 'brain.cortex',
      });

      const speech = summary && finalMessage.stopReason === 'stop' && !finalMessage.errorMessage
        ? await this.speechService.synthesize(summary, this.readString(payload.sessionId) ?? requestId) : undefined;
      return {
        success: true,
        data: {
          requestId,
          confirmedQuestion,
          think: thinkText,
          answer: answerText,
          speech,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.publishEvent(TOPIC.BRAIN_CORTEX_ANSWER_FAILED, {
        requestId,
        confirmedQuestion,
        error: msg,
        source: payload.source ?? 'brain.cortex',
      });
      return { success: false, msg };
    }
  }

  private handleModelsList() {
    const profiles = this.modelConfigService.listProfiles({ strictEnv: false });
    return {
      success: true,
      data: {
        defaultProfile: this.modelConfigService.getDefaultProfileName(),
        profiles,
      },
    };
  }

  private async handleModelsValidate(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const strictEnv = payload.strictEnv === undefined ? true : Boolean(payload.strictEnv);

    const config = this.modelConfigService.getConfig({
      forceReload: true,
      strictEnv: false,
    });
    const validation = this.modelConfigService.validateConfig(config, { strictEnv });
    const authErrors: string[] = [];
    const authWarnings: string[] = [];
    const modelInitErrors: string[] = [];
    for (const [name, profile] of Object.entries(config.brain.profiles)) {
      const authValidation = await this.providerAuthService.validateProfile(name, profile);
      authErrors.push(...authValidation.errors);
      authWarnings.push(...authValidation.warnings);
      const modelValidation = await this.llmService.validateModelInitialization(name);
      if (!modelValidation.valid) {
        modelInitErrors.push(`profile "${name}" model init failed: ${modelValidation.error}`);
      }
    }

    const valid =
      validation.valid &&
      authErrors.length === 0 &&
      modelInitErrors.length === 0;
    return {
      success: valid,
      data: {
        valid,
        errors: [...validation.errors, ...authErrors, ...modelInitErrors],
        warnings: [...validation.warnings, ...authWarnings],
      },
    };
  }

  /** 切换默认档案/模型（human-48b 可视化模型配置） */
  private handleModelSwitch(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const profile = typeof payload.profile === 'string' ? payload.profile.trim() : '';
    const model = typeof payload.model === 'string' ? payload.model.trim() : '';
    if (!profile) {
      return { success: false, msg: 'profile is required' };
    }
    try {
      const result = this.modelConfigService.setDefaultProfile(profile, model || undefined);
      this.logger.log(`默认模型已切换: ${result.profile} → ${result.model}`);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** 服务端代理拉取档案通道的 /models（OpenAI 兼容）；密钥不出后端 */
  private async handleProvidersRemoteModels(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const profileName = typeof payload.profile === 'string' ? payload.profile.trim() : '';
    if (!profileName) {
      return { success: false, msg: 'profile is required' };
    }
    const conn = this.modelConfigService.getProfileConnection(profileName);
    if (!conn) {
      return { success: false, msg: `profile "${profileName}" not found` };
    }
    if (!conn.baseUrl) {
      return { success: false, msg: `profile "${profileName}" has no baseUrl（不支持通道对比）` };
    }
    if (!conn.apiKey) {
      return {
        success: false,
        msg: `profile "${profileName}" has no API key（env: ${conn.apiKeyEnv ?? '未配置'}）`,
      };
    }
    try {
      const models = await fetchOpenAICompatModels(conn.baseUrl, conn.apiKey);
      return { success: true, data: { profile: profileName, models } };
    } catch (error) {
      return {
        success: false,
        msg: `拉取通道模型失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /** 无密钥探测 baseUrl：先试 OpenAI 兼容 /models，再试 Ollama /api/tags（human-48b） */
  private async handleProvidersProbe(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const baseUrl = (typeof payload.baseUrl === 'string' ? payload.baseUrl.trim() : '').replace(
      /\/+$/,
      '',
    );
    if (!/^https?:\/\//.test(baseUrl)) {
      return { success: false, msg: 'baseUrl must be an http(s) URL' };
    }
    try {
      const models = await fetchOpenAICompatModels(baseUrl);
      return { success: true, data: { ok: true, source: 'openai' as const, models } };
    } catch {
      // fallthrough 到 Ollama
    }
    try {
      const json = await fetchJsonWithTimeout(`${baseUrl}/api/tags`);
      const models = Array.isArray(json?.models)
        ? json.models.map((m: { name?: string }) => String(m.name ?? '')).filter(Boolean)
        : [];
      if (models.length === 0) {
        return { success: true, data: { ok: false, source: 'none' as const, models: [] } };
      }
      return { success: true, data: { ok: true, source: 'ollama' as const, models } };
    } catch (error) {
      return {
        success: true,
        data: {
          ok: false,
          source: 'none' as const,
          models: [],
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async handleOAuthProviders() {
    const providers = await this.providerAuthService.listOAuthProviders();
    return {
      success: true,
      data: providers,
    };
  }

  private async handleOAuthLogin(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const provider = this.readString(payload.provider);
    if (!provider) {
      throw new Error('payload.provider is required');
    }

    const result = await this.providerAuthService.loginOAuth({
      provider,
      manualCode: this.readString(payload.manualCode),
    });

    return {
      success: true,
      data: result,
    };
  }

  private async resolveContext(payload: Record<string, any>): Promise<Context> {
    if (payload.context && this.ensureObject(payload.context).messages) {
      return await this.attachMemoryContext(payload.context as Context, payload);
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (messages.length > 0) {
      return await this.attachMemoryContext({
        systemPrompt: this.readString(payload.systemPrompt),
        messages,
      }, payload);
    }

    const userText = this.readString(payload.userText);
    if (!userText) {
      throw new Error('payload.userText or payload.messages/context is required');
    }
    return await this.attachMemoryContext({
      systemPrompt: this.readString(payload.systemPrompt),
      messages: [
        {
          role: 'user',
          content: userText,
          timestamp: Date.now(),
        },
      ],
    }, payload);
  }

  private async attachMemoryContext(
    context: Context,
    payload: Record<string, any>,
  ): Promise<Context> {
    const useMemory = this.readBoolean(payload.useMemory) ?? false;
    const memoryQuery =
      this.readString(payload.memoryQuery) ??
      this.readString(payload.userText);
    if (!useMemory || !memoryQuery) {
      return context;
    }

    const memoryResults = this.memoryService.search({
      query: memoryQuery,
      limit: this.readNumber(payload.memoryLimit) ?? 5,
    });
    if (memoryResults.length === 0) {
      return context;
    }

    const memoryPrompt = [
      'Memory references (use when relevant and cite sourceUri/sourcePath):',
      ...memoryResults.map((item, idx) => {
        const source = item.sourcePath ?? item.sourceUri;
        return `${idx + 1}. [${source}] ${item.snippet || item.content}`;
      }),
    ].join('\n');

    const basePrompt = context.systemPrompt?.trim();
    const memoryMessage = {
      role: 'user' as const,
      content: [
        'You have retrieved memory context for the next user request.',
        'Use it when relevant and mention sourceUri/sourcePath when citing facts.',
        '',
        memoryPrompt,
      ].join('\n'),
      timestamp: Date.now(),
    };

    return {
      ...context,
      messages: [memoryMessage, ...context.messages],
      systemPrompt: basePrompt
        ? `${basePrompt}\n\n${memoryPrompt}`
        : memoryPrompt,
    };
  }

  private publishEvent(topic: string, payload: any): void {
    const eventMessage: BusMessage = {
      id: crypto.randomUUID(),
      kind: 'event',
      topic,
      source: BRAIN_CORTEX_ACTOR,
      timestamp: Date.now(),
      payload,
    };

    const subscribers = this.coreService.findSubscribers(topic, 'event');
    this.logger.log(`[event] ${topic} subscribers=${subscribers.length}`);
    for (const sub of subscribers) {
      this.wsGateway.sendToConnection(sub.connectionId, 'message', eventMessage);
    }
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

  private parseChatOptions(payload: Record<string, any>): {
    providerOptions: Record<string, any>;
    stripThinking: boolean;
  } {
    const rawOptions = this.ensureObject(payload.options);
    const providerOptions = { ...rawOptions };
    delete providerOptions.stripThinking;
    delete providerOptions.thinkingVisibility;

    let stripThinking =
      this.readBoolean(rawOptions.stripThinking) ??
      this.readBoolean(payload.stripThinking) ??
      false;

    const thinkingVisibility =
      this.readString(rawOptions.thinkingVisibility) ??
      this.readString(payload.thinkingVisibility);
    if (thinkingVisibility === 'hidden') stripThinking = true;
    if (thinkingVisibility === 'raw') stripThinking = false;

    return { providerOptions, stripThinking };
  }

  private stripThinkingFromAssistantMessage<T extends Record<string, any>>(
    message: T,
  ): T {
    const content = Array.isArray(message.content) ? message.content : [];
    if (content.length === 0) return message;

    let changed = false;
    const nextContent: any[] = [];

    for (const part of content) {
      if (
        typeof part !== 'object' ||
        part === null ||
        part.type !== 'text' ||
        typeof part.text !== 'string'
      ) {
        nextContent.push(part);
        continue;
      }

      const cleanedText = this.stripThinkingTags(part.text);
      if (cleanedText !== part.text) changed = true;
      if (cleanedText.trim().length === 0) {
        continue;
      }
      nextContent.push({
        ...part,
        text: cleanedText,
      });
    }

    if (!changed) return message;
    return {
      ...message,
      content: nextContent,
    };
  }

  private stripThinkingTags(text: string): string {
    const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    return withoutThink.replace(/\n{3,}/g, '\n\n').trim();
  }

  private extractTextFromStreamEvent(event: unknown): string {
    if (!event || typeof event !== 'object') return '';
    const obj = event as Record<string, any>;

    // Pi's *_end events carry complete snapshots, not deltas. In particular,
    // thinking_* content must never become answer text or narration input.
    if (typeof obj.type === 'string' && obj.type !== 'text_delta') return '';

    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.delta === 'string') return obj.delta;
    if (typeof obj.content === 'string') return obj.content;

    if (Array.isArray(obj.content)) {
      const text = obj.content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof part.text === 'string') {
            return part.text;
          }
          return '';
        })
        .join('');
      if (text) return text;
    }
    return '';
  }

  private consumeTextByThinkTags(
    text: string,
    initialMode: 'think' | 'answer',
  ): {
    thinkDelta: string;
    answerDelta: string;
    buffer: string;
    mode: 'think' | 'answer';
  } {
    let remaining = text;
    let mode = initialMode;
    let thinkDelta = '';
    let answerDelta = '';

    while (remaining.length > 0) {
      const openTag = '<think>';
      const closeTag = '</think>';
      const targetTag = mode === 'answer' ? openTag : closeTag;
      const idx = remaining.indexOf(targetTag);

      if (idx === -1) {
        const hold = this.detectPossibleTagPrefixSuffix(remaining, targetTag);
        const consumable = remaining.slice(0, remaining.length - hold.length);
        if (mode === 'answer') answerDelta += consumable;
        else thinkDelta += consumable;
        return {
          thinkDelta,
          answerDelta,
          buffer: hold,
          mode,
        };
      }

      const before = remaining.slice(0, idx);
      if (mode === 'answer') answerDelta += before;
      else thinkDelta += before;
      remaining = remaining.slice(idx + targetTag.length);
      mode = mode === 'answer' ? 'think' : 'answer';
    }

    return {
      thinkDelta,
      answerDelta,
      buffer: '',
      mode,
    };
  }

  private detectPossibleTagPrefixSuffix(text: string, tag: string): string {
    const maxLen = Math.min(text.length, tag.length - 1);
    for (let len = maxLen; len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) {
        return text.slice(text.length - len);
      }
    }
    return '';
  }

  private extractThinkText(text: string): string {
    const matches = text.match(/<think>([\s\S]*?)<\/think>/gi) ?? [];
    if (matches.length === 0) return '';
    return matches
      .map((chunk) => chunk.replace(/<\/?think>/gi, '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private extractAssistantText(message: Record<string, any>): string {
    const content = Array.isArray(message.content) ? message.content : [];
    const textParts = content
      .filter((part: any) => part?.type === 'text' && typeof part?.text === 'string')
      .map((part: any) => part.text as string);
    return textParts.join('\n').trim();
  }
}
