import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import {
  BrainModelProfileConfig,
  PiModelsRegistry,
  PiProviderDefinition,
  PiProviderModel,
} from './config.types';
import { ModelConfigService } from './model-config.service';

interface SyncOptions {
  dryRun?: boolean;
  forceReload?: boolean;
}

interface RegistryChange {
  provider: string;
  modelId: string;
  action: 'added' | 'updated';
}

interface SyncResult {
  path: string;
  dryRun: boolean;
  changed: boolean;
  changes: RegistryChange[];
}

@Injectable()
export class PiModelRegistryService {
  private readonly piModelsPath = path.join(
    os.homedir(),
    '.pi',
    'agent',
    'models.json',
  );

  constructor(private readonly modelConfigService: ModelConfigService) {}

  getPiModelsPath(): string {
    return this.piModelsPath;
  }

  previewSync(options?: Omit<SyncOptions, 'dryRun'>): SyncResult {
    return this.syncToPiModelsRegistry({ ...options, dryRun: true });
  }

  syncToPiModelsRegistry(options?: SyncOptions): SyncResult {
    const dryRun = options?.dryRun ?? false;
    const config = this.modelConfigService.getConfig({
      forceReload: options?.forceReload,
      strictEnv: false,
    });

    const existing = this.readExistingRegistry();
    const next: PiModelsRegistry = {
      providers: { ...existing.providers },
    };

    const generatedProviders = this.buildProvidersFromProfiles(
      config.brain.profiles,
    );
    const changes: RegistryChange[] = [];

    for (const [providerName, generated] of Object.entries(generatedProviders)) {
      const existingProvider = next.providers[providerName];
      if (!existingProvider) {
        next.providers[providerName] = generated;
        for (const model of generated.models) {
          changes.push({
            provider: providerName,
            modelId: model.id,
            action: 'added',
          });
        }
        continue;
      }

      // 保留已有 provider 上的额外字段，仅覆盖本适配器负责字段。
      existingProvider.baseUrl = generated.baseUrl;
      existingProvider.api = generated.api;
      if (generated.apiKey) {
        existingProvider.apiKey = generated.apiKey;
      }
      if (!Array.isArray(existingProvider.models)) {
        existingProvider.models = [];
      }

      for (const model of generated.models) {
        const current = existingProvider.models.find((m) => m.id === model.id);
        if (!current) {
          existingProvider.models.push(model);
          changes.push({
            provider: providerName,
            modelId: model.id,
            action: 'added',
          });
        } else {
          Object.assign(current, model);
          changes.push({
            provider: providerName,
            modelId: model.id,
            action: 'updated',
          });
        }
      }
    }

    if (!dryRun && changes.length > 0) {
      this.ensurePiDir();
      fs.writeFileSync(this.piModelsPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
    }

    return {
      path: this.piModelsPath,
      dryRun,
      changed: changes.length > 0,
      changes,
    };
  }

  validateRegistryShape(raw: unknown): string[] {
    const errors: string[] = [];
    if (!this.isObject(raw)) {
      errors.push('registry must be an object');
      return errors;
    }
    if (!this.isObject(raw.providers)) {
      errors.push('registry.providers must be an object');
      return errors;
    }

    for (const [providerName, provider] of Object.entries(raw.providers)) {
      if (!this.isObject(provider)) {
        errors.push(`provider "${providerName}" must be an object`);
        continue;
      }
      if (typeof provider.baseUrl !== 'string' || !provider.baseUrl.trim()) {
        errors.push(`provider "${providerName}" must have non-empty baseUrl`);
      }
      if (
        provider.api !== 'openai-completions' &&
        provider.api !== 'responses' &&
        provider.api !== 'chat-completions'
      ) {
        errors.push(
          `provider "${providerName}" api must be one of openai-completions/responses/chat-completions`,
        );
      }
      if (!Array.isArray(provider.models)) {
        errors.push(`provider "${providerName}" models must be an array`);
        continue;
      }
      for (const model of provider.models) {
        if (!this.isObject(model) || typeof model.id !== 'string' || typeof model.name !== 'string') {
          errors.push(`provider "${providerName}" has invalid model entry`);
        }
      }
    }
    return errors;
  }

  private buildProvidersFromProfiles(
    profiles: Record<string, BrainModelProfileConfig>,
  ): Record<string, PiProviderDefinition> {
    const providers: Record<string, PiProviderDefinition> = {};

    for (const profile of Object.values(profiles)) {
      // 仅将 custom provider（有 baseUrl + api）同步到 pi models registry。
      if (!profile.baseUrl || !profile.api) continue;
      const modelId = profile.model?.trim();
      if (!modelId) continue;

      const providerName = profile.provider;
      const model: PiProviderModel = {
        id: modelId,
        name: modelId,
        ...(profile.reasoning !== undefined ? { reasoning: profile.reasoning } : {}),
        ...(profile.contextWindow !== undefined
          ? { contextWindow: profile.contextWindow }
          : {}),
        ...(profile.maxTokens !== undefined ? { maxTokens: profile.maxTokens } : {}),
        input: ['text'],
      };

      const existing = providers[providerName];
      if (!existing) {
        providers[providerName] = {
          baseUrl: profile.baseUrl,
          api: profile.api,
          ...(profile.apiKeyEnv ? { apiKey: profile.apiKeyEnv } : {}),
          models: [model],
        };
        continue;
      }

      const dup = existing.models.find((m) => m.id === model.id);
      if (!dup) {
        existing.models.push(model);
      } else {
        Object.assign(dup, model);
      }
    }

    return providers;
  }

  private readExistingRegistry(): PiModelsRegistry {
    if (!fs.existsSync(this.piModelsPath)) {
      return { providers: {} };
    }

    const text = fs.readFileSync(this.piModelsPath, 'utf-8');
    const parsed = JSON.parse(text) as unknown;
    const errors = this.validateRegistryShape(parsed);
    if (errors.length > 0) {
      throw new Error(
        `Invalid pi models registry at ${this.piModelsPath}: ${errors.join('; ')}`,
      );
    }
    return parsed as PiModelsRegistry;
  }

  private ensurePiDir(): void {
    const dir = path.dirname(this.piModelsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
