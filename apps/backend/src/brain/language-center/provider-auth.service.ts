import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import type { OAuthCredentials } from '@mariozechner/pi-ai/oauth';
import type { BrainModelProfileConfig } from './config.types';

interface AuthValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

type OAuthCredentialStore = Record<string, OAuthCredentials>;
const PI_AI_OAUTH_MODULE = '@mariozechner/pi-ai/oauth';
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

  async resolveApiKey(profileName: string, profile: BrainModelProfileConfig): Promise<string | undefined> {
    const oauthProvider = this.resolveOAuthProvider(profile);
    if (oauthProvider) {
      const { getOAuthApiKey } = await this.getOAuthModule();
      const credentials = this.readOAuthStore();
      const result = await getOAuthApiKey(oauthProvider, credentials);
      if (!result) {
        throw new Error(
          `profile "${profileName}" requires OAuth credentials for "${oauthProvider}" at ${this.authPath}`,
        );
      }
      if (result.newCredentials) {
        credentials[oauthProvider] = result.newCredentials;
        this.writeOAuthStore(credentials);
      }
      return result.apiKey;
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

  private async getOAuthModule(): Promise<typeof import('@mariozechner/pi-ai/oauth')> {
    return dynamicImport<typeof import('@mariozechner/pi-ai/oauth')>(
      PI_AI_OAUTH_MODULE,
    );
  }

  async listOAuthProviders(): Promise<
    Array<{ id: string; name: string; usesCallbackServer: boolean }>
  > {
    const { getOAuthProviders } = await this.getOAuthModule();
    return getOAuthProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      usesCallbackServer: Boolean(provider.usesCallbackServer),
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

    const { getOAuthProvider } = await this.getOAuthModule();
    const oauthProvider = getOAuthProvider(providerId);
    if (!oauthProvider) {
      const providers = await this.listOAuthProviders();
      throw new Error(
        `OAuth provider "${providerId}" is not registered. Available: ${providers.map((p) => p.id).join(', ')}`,
      );
    }

    const progress: string[] = [];
    let authInfo: OAuthLoginResult['authInfo'];
    const manualCode = params.manualCode?.trim();
    let credentials: OAuthCredentials;
    try {
      credentials = await oauthProvider.login({
        onAuth: (info) => {
          authInfo = info;
        },
        onProgress: (message) => {
          progress.push(message);
        },
        onPrompt: async (prompt) => {
          if (manualCode) return manualCode;
          throw new Error(
            `OAuth login for "${providerId}" requires manual input: ${prompt.message}`,
          );
        },
        ...(manualCode
          ? {
              onManualCodeInput: async () => manualCode,
            }
          : {}),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const authHint = authInfo?.url ? ` auth_url=${authInfo.url}` : '';
      const progressHint = progress.length > 0 ? ` progress=${progress.join(' | ')}` : '';
      throw new Error(
        `OAuth login failed for "${providerId}": ${msg}.${authHint}${progressHint}`,
      );
    }

    const store = this.readOAuthStore();
    store[providerId] = credentials;
    this.writeOAuthStore(store);

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

  private readOAuthStore(): OAuthCredentialStore {
    if (!fs.existsSync(this.authPath)) {
      return {};
    }

    const text = fs.readFileSync(this.authPath, 'utf-8');
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Invalid OAuth credential file format: ${this.authPath}`);
    }
    return parsed as OAuthCredentialStore;
  }

  private writeOAuthStore(store: OAuthCredentialStore): void {
    const dir = path.dirname(this.authPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.authPath, JSON.stringify(store, null, 2) + '\n', 'utf-8');
    try {
      fs.chmodSync(this.authPath, 0o600);
    } catch {
      // noop: chmod may fail on some environments
    }
  }
}
