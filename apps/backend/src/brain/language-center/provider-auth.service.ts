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
    if (profile.provider === 'openai-codex') {
      const { getOAuthApiKey } = await this.getOAuthModule();
      const credentials = this.readOAuthStore();
      const result = await getOAuthApiKey('openai-codex', credentials);
      if (!result) {
        throw new Error(
          `profile "${profileName}" requires openai-codex OAuth credentials at ${this.authPath}`,
        );
      }
      if (result.newCredentials) {
        credentials['openai-codex'] = result.newCredentials;
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

  async validateProfile(profileName: string, profile: BrainModelProfileConfig): Promise<AuthValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (profile.provider === 'openai-codex') {
      if (!profile.auth || profile.auth.type !== 'oauth') {
        errors.push(
          `profile "${profileName}" provider=openai-codex must configure auth.type=oauth`,
        );
        return { valid: false, errors, warnings };
      }

      if (!fs.existsSync(this.authPath)) {
        errors.push(
          `profile "${profileName}" missing OAuth credential file: ${this.authPath}`,
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
