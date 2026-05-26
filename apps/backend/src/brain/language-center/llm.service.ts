import { Injectable } from '@nestjs/common';
import {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  Context,
  Model,
  ProviderStreamOptions,
} from '@mariozechner/pi-ai';
import { BrainModelProfileConfig } from './config.types';
import { ModelConfigService } from './model-config.service';
import { ProviderAuthService } from './provider-auth.service';

const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const PI_AI_MODULE = '@mariozechner/pi-ai';
const dynamicImport = <T = unknown>(specifier: string): Promise<T> =>
  new Function('s', 'return import(s)')(specifier) as Promise<T>;

export interface LlmRequest {
  profileName?: string;
  context: Context;
  options?: ProviderStreamOptions;
  timeoutMs?: number;
  retryAttempts?: number;
}

export interface LlmResolvedModel {
  profileName: string;
  profile: BrainModelProfileConfig;
  model: Model<Api>;
}

@Injectable()
export class LlmService {
  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly providerAuthService: ProviderAuthService,
  ) {}

  async resolveModel(profileName?: string): Promise<LlmResolvedModel> {
    const { name, profile } = this.modelConfigService.getProfile(profileName, {
      strictEnv: false,
    });
    return {
      profileName: name,
      profile,
      model: await this.createModelFromProfile(profile),
    };
  }

  async validateModelInitialization(profileName?: string): Promise<{ valid: boolean; error?: string }> {
    try {
      await this.resolveModel(profileName);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async complete(request: LlmRequest): Promise<AssistantMessage> {
    const resolved = await this.resolveModel(request.profileName);
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retryAttempts = request.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
    const { complete } = await this.getPiAi();

    return this.retry(async () => {
      const { controller, cleanup } = this.createTimeoutController(timeoutMs);
      try {
        return await complete(
          resolved.model,
          request.context,
          await this.buildStreamOptions(
            resolved.profileName,
            resolved.profile,
            request.options,
            controller.signal,
          ),
        );
      } catch (error) {
        throw this.mapError(error, resolved.profileName, resolved.profile.provider);
      } finally {
        cleanup();
      }
    }, retryAttempts);
  }

  async stream(request: LlmRequest): Promise<AssistantMessageEventStream> {
    const resolved = await this.resolveModel(request.profileName);
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const { controller, cleanup } = this.createTimeoutController(timeoutMs);
    const { stream } = await this.getPiAi();

    try {
      const eventStream = stream(
        resolved.model,
        request.context,
        await this.buildStreamOptions(
          resolved.profileName,
          resolved.profile,
          request.options,
          controller.signal,
        ),
      );
      void eventStream.result().finally(cleanup);
      return eventStream;
    } catch (error) {
      cleanup();
      throw this.mapError(error, resolved.profileName, resolved.profile.provider);
    }
  }

  private async createModelFromProfile(profile: BrainModelProfileConfig): Promise<Model<Api>> {
    const modelId = profile.model?.trim();
    if (!modelId) {
      throw new Error(`profile "${profile.provider}" has no resolved model`);
    }
    // custom provider: 从本地配置构建 OpenAI-compatible model
    if (profile.baseUrl && profile.api) {
      return {
        id: modelId,
        name: modelId,
        api: profile.api,
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        reasoning: profile.reasoning ?? false,
        input: ['text'],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        contextWindow: profile.contextWindow ?? 128_000,
        maxTokens: profile.maxTokens ?? 16_384,
      };
    }

    const { getModel } = await this.getPiAi();
    return getModel(profile.provider as any, modelId as any) as Model<Api>;
  }

  private async getPiAi(): Promise<typeof import('@mariozechner/pi-ai')> {
    return dynamicImport<typeof import('@mariozechner/pi-ai')>(PI_AI_MODULE);
  }

  private async buildStreamOptions(
    profileName: string,
    profile: BrainModelProfileConfig,
    options: ProviderStreamOptions | undefined,
    signal: AbortSignal,
  ): Promise<ProviderStreamOptions> {
    const apiKey = await this.providerAuthService.resolveApiKey(profileName, profile);
    return {
      ...(options ?? {}),
      signal,
      ...(apiKey ? { apiKey } : {}),
    };
  }

  private createTimeoutController(timeoutMs: number): {
    controller: AbortController;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
      controller,
      cleanup: () => clearTimeout(timer),
    };
  }

  private async retry<T>(
    task: () => Promise<T>,
    attempts: number,
  ): Promise<T> {
    let lastError: unknown;
    const total = Math.max(1, attempts);
    for (let i = 0; i < total; i++) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private mapError(error: unknown, profileName: string, provider: string): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(
      `[llm:${profileName}/${provider}] ${message}`,
    );
  }
}
