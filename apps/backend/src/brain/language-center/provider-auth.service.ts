import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import type {
  Credential,
  CredentialInfo,
  CredentialStore,
  Models,
} from '@earendil-works/pi-ai';
import type { BrainModelProfileConfig } from './config.types';

interface AuthValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const PI_AI_MODULE = '@earendil-works/pi-ai';
const dynamicImport = <T = unknown>(specifier: string): Promise<T> =>
  new Function('s', 'return import(s)')(specifier) as Promise<T>;

interface OAuthLoginResult {
  provider: string;
  authPath: string;
  authInfo?: {
    url: string;
    instructions?: string;
  };
  progress: string[];
}

class SecretaryCredentialStore implements CredentialStore {
  constructor(private readonly authPath: string) {}

  private readStore(): Record<string, Credential> {
    if (!fs.existsSync(this.authPath)) return {};
    try {
      const text = fs.readFileSync(this.authPath, 'utf-8');
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
      const store: Record<string, Credential> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object') {
          const cred = { ...(v as any) };
          if (!cred.type && (cred.access || cred.refresh)) {
            cred.type = 'oauth';
          }
          store[k] = cred;
        }
      }
      return store;
    } catch {
      return {};
    }
  }

  private writeStore(store: Record<string, Credential>): void {
    const dir = path.dirname(this.authPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.authPath, JSON.stringify(store, null, 2) + '\n', 'utf-8');
    try {
      fs.chmodSync(this.authPath, 0o600);
    } catch {
      // noop
    }
  }

  async read(providerId: string): Promise<Credential | undefined> {
    const store = this.readStore();
    return store[providerId];
  }

  async list(): Promise<readonly CredentialInfo[]> {
    const store = this.readStore();
    return Object.entries(store).map(([providerId, cred]) => ({
      providerId,
      type: cred.type || 'oauth',
    }));
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const store = this.readStore();
    const current = store[providerId];
    const updated = await fn(current);
    if (updated) {
      store[providerId] = updated;
      this.writeStore(store);
    }
    return updated;
  }

  async delete(providerId: string): Promise<void> {
    const store = this.readStore();
    delete store[providerId];
    this.writeStore(store);
  }
}

const PI_AI_PROVIDERS_ALL_MODULE = '@earendil-works/pi-ai/providers/all';

@Injectable()
export class ProviderAuthService {
  private readonly authPath = path.join(
    os.homedir(),
    '.ai_secretary',
    'auth.json',
  );

  getAuthPath(): string {
    return this.authPath;
  }

  private async createModelsInstance(): Promise<Models> {
    const { builtinModels } = await dynamicImport<typeof import('@earendil-works/pi-ai/providers/all')>(
      PI_AI_PROVIDERS_ALL_MODULE,
    );
    return builtinModels({
      credentials: new SecretaryCredentialStore(this.authPath),
    });
  }

  async resolveApiKey(profileName: string, profile: BrainModelProfileConfig): Promise<string | undefined> {
    const oauthProvider = this.resolveOAuthProvider(profile);
    if (oauthProvider) {
      const models = await this.createModelsInstance();
      const authResult = await models.getAuth(oauthProvider);
      if (!authResult?.auth.apiKey) {
        throw new Error(
          `profile "${profileName}" requires OAuth credentials for "${oauthProvider}" at ${this.authPath}`,
        );
      }
      return authResult.auth.apiKey;
    }

    if (!profile.apiKeyEnv) return undefined;
    const apiKey = process.env[profile.apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `profile "${profileName}" requires env "${profile.apiKeyEnv}" but it is not set`,
      );
    }
    return apiKey;
  }

  async listOAuthProviders(): Promise<
    Array<{ id: string; name: string; loginLabel?: string }>
  > {
    const models = await this.createModelsInstance();
    return models
      .getProviders()
      .filter((p) => Boolean(p.auth.oauth))
      .map((p) => ({
        id: p.id,
        name: p.name,
        loginLabel: p.auth.oauth?.loginLabel,
      }));
  }

  async loginOAuth(params: {
    provider: string;
    manualCode?: string;
  }): Promise<OAuthLoginResult> {
    const providerId = params.provider?.trim();
    if (!providerId) {
      throw new Error('payload.provider is required');
    }

    const models = await this.createModelsInstance();
    const provider = models.getProvider(providerId);
    if (!provider || !provider.auth.oauth) {
      const providers = await this.listOAuthProviders();
      throw new Error(
        `OAuth provider "${providerId}" is not registered. Available: ${providers.map((p) => p.id).join(', ')}`,
      );
    }

    const progress: string[] = [];
    let authInfo: OAuthLoginResult['authInfo'];
    const manualCode = params.manualCode?.trim();

    try {
      await models.login(providerId, 'oauth', {
        notify: (event) => {
          if (event.type === 'auth_url') {
            authInfo = { url: event.url, instructions: event.instructions };
          } else if (event.type === 'progress') {
            progress.push(event.message);
          }
        },
        prompt: async (prompt) => {
          if (manualCode) return manualCode;
          throw new Error(
            `OAuth login for "${providerId}" requires manual input: ${prompt.message}`,
          );
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const authHint = authInfo?.url ? ` auth_url=${authInfo.url}` : '';
      const progressHint = progress.length > 0 ? ` progress=${progress.join(' | ')}` : '';
      throw new Error(
        `OAuth login failed for "${providerId}": ${msg}.${authHint}${progressHint}`,
      );
    }

    return {
      provider: providerId,
      authPath: this.authPath,
      authInfo,
      progress,
    };
  }

  async validateProfile(profileName: string, profile: BrainModelProfileConfig): Promise<AuthValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const oauthProvider = this.resolveOAuthProvider(profile);
    if (oauthProvider) {
      if (!fs.existsSync(this.authPath)) {
        errors.push(
          `profile "${profileName}" missing OAuth credential file: ${this.authPath} (provider=${oauthProvider})`,
        );
        return { valid: false, errors, warnings };
      }

      try {
        await this.resolveApiKey(profileName, profile);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
      return { valid: errors.length === 0, errors, warnings };
    }

    if (profile.apiKeyEnv) {
      if (!process.env[profile.apiKeyEnv]) {
        errors.push(
          `profile "${profileName}" missing env "${profile.apiKeyEnv}"`,
        );
      }
    } else if (!profile.baseUrl) {
      warnings.push(
        `profile "${profileName}" has no apiKeyEnv; provider may fail if it requires API key`,
      );
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private resolveOAuthProvider(
    profile: BrainModelProfileConfig,
  ): string | undefined {
    if (profile.auth?.type === 'oauth' && profile.auth.provider?.trim()) {
      return profile.auth.provider.trim();
    }
    return undefined;
  }
}
