import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import {
  ConfigValidationResult,
  SecretaryConfig,
} from './config.types';

@Injectable()
export class ModelConfigService {
  private readonly logger = new Logger(ModelConfigService.name);
  private readonly configPath = path.join(
    os.homedir(),
    '.ai_secretary',
    'config.json',
  );
  private cachedConfig: SecretaryConfig | null = null;

  getConfigPath(): string {
    return this.configPath;
  }

  getConfig(options?: { forceReload?: boolean; strictEnv?: boolean }): SecretaryConfig {
    const forceReload = options?.forceReload ?? false;
    const strictEnv = options?.strictEnv ?? true;

    if (!forceReload && this.cachedConfig) {
      return this.cachedConfig;
    }

    const config = this.loadConfigFromDisk();
    const validation = this.validateConfig(config, { strictEnv });
    if (!validation.valid) {
      throw new Error(
        `Invalid AI secretary config at ${this.configPath}: ${validation.errors.join('; ')}`,
      );
    }

    for (const warning of validation.warnings) {
      this.logger.warn(`[config-warning] ${warning}`);
    }

    this.cachedConfig = config;
    this.logger.log(
      `Loaded AI config: defaultProfile=${config.brain.defaultProfile}, profiles=${Object.keys(config.brain.profiles).length}`,
    );
    return config;
  }

  getDefaultProfile(options?: { forceReload?: boolean; strictEnv?: boolean }) {
    const config = this.getConfig(options);
    return config.brain.profiles[config.brain.defaultProfile];
  }

  getProfile(
    profileName?: string,
    options?: { forceReload?: boolean; strictEnv?: boolean },
  ) {
    const config = this.getConfig(options);
    const resolvedName = profileName ?? config.brain.defaultProfile;
    const profile = config.brain.profiles[resolvedName];
    if (!profile) {
      throw new Error(`Profile "${resolvedName}" not found in ${this.configPath}`);
    }
    return {
      name: resolvedName,
      profile,
    };
  }

  listProfiles(options?: { forceReload?: boolean; strictEnv?: boolean }) {
    const config = this.getConfig(options);
    return Object.entries(config.brain.profiles).map(([name, profile]) => ({
      name,
      ...profile,
    }));
  }

  validateConfig(
    raw: unknown,
    options?: { strictEnv?: boolean },
  ): ConfigValidationResult {
    const strictEnv = options?.strictEnv ?? true;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.isObject(raw)) {
      return { valid: false, errors: ['config must be an object'], warnings };
    }

    if (!Number.isInteger(raw.version) || raw.version < 1) {
      errors.push('version must be an integer >= 1');
    }

    if (!this.isObject(raw.brain)) {
      errors.push('brain must be an object');
      return { valid: false, errors, warnings };
    }

    if (typeof raw.brain.defaultProfile !== 'string' || !raw.brain.defaultProfile.trim()) {
      errors.push('brain.defaultProfile must be a non-empty string');
    }

    if (!this.isObject(raw.brain.profiles)) {
      errors.push('brain.profiles must be an object');
      return { valid: false, errors, warnings };
    }

    const profileEntries = Object.entries(raw.brain.profiles);
    if (profileEntries.length === 0) {
      errors.push('brain.profiles must contain at least one profile');
    }

    for (const [profileName, profile] of profileEntries) {
      if (!this.isObject(profile)) {
        errors.push(`profile "${profileName}" must be an object`);
        continue;
      }

      if (typeof profile.provider !== 'string' || !profile.provider.trim()) {
        errors.push(`profile "${profileName}" must define non-empty provider`);
      }

      if (typeof profile.model !== 'string' || !profile.model.trim()) {
        errors.push(`profile "${profileName}" must define non-empty model`);
      }

      if (
        profile.apiKeyEnv !== undefined &&
        (typeof profile.apiKeyEnv !== 'string' ||
          !/^[A-Z_][A-Z0-9_]*$/.test(profile.apiKeyEnv))
      ) {
        errors.push(
          `profile "${profileName}" has invalid apiKeyEnv (must match ^[A-Z_][A-Z0-9_]*$)`,
        );
      }

      if (
        profile.provider === 'openai-codex' &&
        (!this.isObject(profile.auth) ||
          profile.auth.type !== 'oauth' ||
          typeof profile.auth.provider !== 'string' ||
          !profile.auth.provider.trim())
      ) {
        errors.push(
          `profile "${profileName}" with provider=openai-codex must define auth.type=oauth and auth.provider`,
        );
      }
    }

    const defaultProfile = raw.brain.defaultProfile;
    if (
      typeof defaultProfile === 'string' &&
      this.isObject(raw.brain.profiles) &&
      !Object.prototype.hasOwnProperty.call(raw.brain.profiles, defaultProfile)
    ) {
      errors.push(`defaultProfile "${defaultProfile}" does not exist in brain.profiles`);
    }

    if (this.isObject(raw.brain.profiles)) {
      for (const [profileName, profile] of Object.entries(raw.brain.profiles)) {
        if (!this.isObject(profile) || typeof profile.apiKeyEnv !== 'string') continue;
        const envExists = Boolean(process.env[profile.apiKeyEnv]);
        if (envExists) continue;

        const message = `profile "${profileName}" references env "${profile.apiKeyEnv}" but it is not set`;
        if (strictEnv && profileName === raw.brain.defaultProfile) {
          errors.push(message);
        } else {
          warnings.push(message);
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private loadConfigFromDisk(): SecretaryConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(
        `config file not found: ${this.configPath}. Create it from config.template.json first.`,
      );
    }

    const text = fs.readFileSync(this.configPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`config JSON parse error: ${(error as Error).message}`);
    }

    return parsed as SecretaryConfig;
  }

  private isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
