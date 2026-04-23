import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Context } from '@mariozechner/pi-ai';
import { TOPIC } from 'neural-topics';
import type { BusMessage, Capability } from '../../neural/interfaces';
import type { InternalCommandHandler } from '../../neural/neural-http/neural-http.service';
import { NeuralHttpService } from '../../neural/neural-http/neural-http.service';
import { NeuralCoreService } from '../../neural/neural-core/neural-core.service';
import { NeuralWsGateway } from '../../neural/neural-ws/neural-ws.gateway';
import { LlmService } from '../language-center/llm.service';
import { ModelConfigService } from '../language-center/model-config.service';
import { ProviderAuthService } from '../language-center/provider-auth.service';

const BRAIN_CORTEX_ACTOR = {
  actorId: 'brain-main',
  runtime: 'nest' as const,
  system: 'brain' as const,
  module: 'cortex',
};

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
      topic.startsWith('brain.language.models')
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
        case TOPIC.BRAIN_LANGUAGE_MODELS_LIST:
          return this.handleModelsList();
        case TOPIC.BRAIN_LANGUAGE_MODELS_VALIDATE:
          return this.handleModelsValidate(message);
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
    const response = await this.llmService.complete({
      profileName: this.readString(payload.profileName),
      context: this.resolveContext(payload),
      options: this.ensureObject(payload.options),
      timeoutMs: this.readNumber(payload.timeoutMs),
      retryAttempts: this.readNumber(payload.retryAttempts),
    });

    return {
      success: true,
      data: response,
    };
  }

  private async handleChatStream(message: BusMessage) {
    const payload = this.ensureObject(message.payload);
    const stream = await this.llmService.stream({
      profileName: this.readString(payload.profileName),
      context: this.resolveContext(payload),
      options: this.ensureObject(payload.options),
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
        message: finalMessage,
      },
    };
  }

  private handleModelsList() {
    const profiles = this.modelConfigService.listProfiles({ strictEnv: false });
    return {
      success: true,
      data: profiles,
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

  private resolveContext(payload: Record<string, any>): Context {
    if (payload.context && this.ensureObject(payload.context).messages) {
      return payload.context as Context;
    }

    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (messages.length > 0) {
      return {
        systemPrompt: this.readString(payload.systemPrompt),
        messages,
      };
    }

    const userText = this.readString(payload.userText);
    if (!userText) {
      throw new Error('payload.userText or payload.messages/context is required');
    }
    return {
      systemPrompt: this.readString(payload.systemPrompt),
      messages: [
        {
          role: 'user',
          content: userText,
          timestamp: Date.now(),
        },
      ],
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
}
