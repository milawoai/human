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
  private readonly secretDir = path.join(os.homedir(), '.ai_secretary');
  private readonly configPath = path.join(
    this.secretDir,
    'config.json',
  );
  private readonly secretsEnvPath = path.join(this.secretDir, 'secrets.env');
  private cachedConfig: SecretaryConfig | null = null;
  private secretsLoaded = false;

  getConfigPath(): string {
    return this.configPath;
  }

  getConfig(options?: { forceReload?: boolean; strictEnv?: boolean }): SecretaryConfig {
    const forceReload = options?.forceReload ?? false;
    const strictEnv = options?.strictEnv ?? true;

    if (!forceReload && this.cachedConfig) {
      return this.cachedConfig;
    }

    this.loadSecretsEnvIfPresent();
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
    if (!config.brain.defaultProfile) return undefined;
    return config.brain.profiles[config.brain.defaultProfile];
  }

  getProfile(
    profileName?: string,
    options?: { forceReload?: boolean; strictEnv?: boolean },
  ) {
    const config = this.getConfig(options);
    const resolvedName = profileName ?? config.brain.defaultProfile;
    if (!resolvedName) {
      throw new Error(
        `No profile resolved: brain.defaultProfile is empty in ${this.configPath}`,
      );
    }
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

    if (typeof raw.brain.defaultProfile !== 'string') {
      errors.push('brain.defaultProfile must be a string');
    }

    if (!this.isObject(raw.brain.profiles)) {
      errors.push('brain.profiles must be an object');
      return { valid: false, errors, warnings };
    }

    const profileEntries = Object.entries(raw.brain.profiles);
    if (profileEntries.length === 0) {
      warnings.push('brain.profiles is empty (no model profile configured yet)');
      if (raw.brain.defaultProfile.trim()) {
        errors.push('brain.defaultProfile must be empty when brain.profiles is empty');
      }
    } else if (!raw.brain.defaultProfile.trim()) {
      errors.push('brain.defaultProfile must be non-empty when brain.profiles is not empty');
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
      defaultProfile.trim() &&
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

    if (raw.memory !== undefined) {
      if (!this.isObject(raw.memory)) {
        errors.push('memory must be an object when provided');
      } else {
        if (
          raw.memory.dbPath !== undefined &&
          (typeof raw.memory.dbPath !== 'string' || !raw.memory.dbPath.trim())
        ) {
          errors.push('memory.dbPath must be a non-empty string when provided');
        }

        if (
          raw.memory.obsidianVaultPath !== undefined &&
          (typeof raw.memory.obsidianVaultPath !== 'string' ||
            !raw.memory.obsidianVaultPath.trim())
        ) {
          errors.push('memory.obsidianVaultPath must be a non-empty string when provided');
        }

        if (
          raw.memory.ignoreDirs !== undefined &&
          (!Array.isArray(raw.memory.ignoreDirs) ||
            raw.memory.ignoreDirs.some(
              (item) => typeof item !== 'string' || !item.trim(),
            ))
        ) {
          errors.push('memory.ignoreDirs must be a string array when provided');
        }

        if (
          raw.memory.includeExts !== undefined &&
          (!Array.isArray(raw.memory.includeExts) ||
            raw.memory.includeExts.some(
              (item) => typeof item !== 'string' || !item.trim(),
            ))
        ) {
          errors.push('memory.includeExts must be a string array when provided');
        }

        if (raw.memory.chunk !== undefined) {
          if (!this.isObject(raw.memory.chunk)) {
            errors.push('memory.chunk must be an object when provided');
          } else {
            const { minChars, maxChars, overlapChars } = raw.memory.chunk;
            if (minChars !== undefined && (!Number.isInteger(minChars) || minChars < 1)) {
              errors.push('memory.chunk.minChars must be an integer >= 1 when provided');
            }
            if (maxChars !== undefined && (!Number.isInteger(maxChars) || maxChars < 1)) {
              errors.push('memory.chunk.maxChars must be an integer >= 1 when provided');
            }
            if (
              overlapChars !== undefined &&
              (!Number.isInteger(overlapChars) || overlapChars < 0)
            ) {
              errors.push('memory.chunk.overlapChars must be an integer >= 0 when provided');
            }
          }
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

  private loadSecretsEnvIfPresent(): void {
    if (this.secretsLoaded) return;
    this.secretsLoaded = true;

    if (!fs.existsSync(this.secretsEnvPath)) return;

    const text = fs.readFileSync(this.secretsEnvPath, 'utf-8');
    const lines = text.split(/\r?\n/);
    let loadedCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;

      if (process.env[key] !== undefined) {
        continue;
      }

      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
      loadedCount += 1;
    }

    if (loadedCount > 0) {
      this.logger.log(
        `Loaded ${loadedCount} env keys from ${this.secretsEnvPath}`,
      );
    }
  }

  private isObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
