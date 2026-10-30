import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import {
  BrainModelProfileConfig,
  ConfigValidationResult,
  ProfilesConfigFile,
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
  private readonly profilesPath = path.join(this.secretDir, 'profiles.json');
  private readonly secretsEnvPath = path.join(this.secretDir, 'secrets.env');
  private cachedConfig: SecretaryConfig | null = null;
  private secretsLoaded = false;

  getConfigPath(): string {
    return this.configPath;
  }

  getProfilesPath(): string {
    return this.profilesPath;
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
      profile: this.resolveProfileModel(resolvedName, profile),
    };
  }

  listProfiles(options?: { forceReload?: boolean; strictEnv?: boolean }) {
    const config = this.getConfig(options);
    return Object.entries(config.brain.profiles ?? {}).map(([name, profile]) => ({
      name,
      ...this.resolveProfileModel(name, profile),
    }));
  }

  /** 当前默认档案名（无配置返回空串） */
  getDefaultProfileName(): string {
    const config = this.getConfig({ forceReload: false, strictEnv: false });
    return typeof config.brain.defaultProfile === 'string' ? config.brain.defaultProfile : '';
  }

  /**
   * 获取档案连接信息（仅后端使用，含密钥明文；禁止原样下发给渲染层）。
   * 返回 null 表示档案不存在。
   */  getProfileConnection(profileName: string): {
    baseUrl?: string;
    api?: string;
    apiKeyEnv?: string;
    apiKey?: string;
  } | null {
    this.loadSecretsEnvIfPresent();
    const config = this.getConfig({ forceReload: false, strictEnv: false });
    const profile = config.brain.profiles?.[profileName];
    if (!profile) return null;
    const baseUrl = typeof profile.baseUrl === 'string' ? profile.baseUrl : undefined;
    const api = typeof profile.api === 'string' ? profile.api : undefined;
    const apiKeyEnv = typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv : undefined;
    const apiKey = apiKeyEnv ? process.env[apiKeyEnv] : undefined;
    return { baseUrl, api, apiKeyEnv, apiKey };
  }

  /**
   * 切换默认档案与默认模型（可视化模型配置 human-48b）。
   *
   * - config.json：brain.defaultProfile = profileName
   * - profiles.json：该档案 defaultModel = model（未指定则保持现值）；
   *   model 不在 models 列表时追加，保留可切换历史。
   *
   * 两文件均原子写（tmp + rename）；写后失效内存缓存。
   */
  setDefaultProfile(profileName: string, model?: string): { profile: string; model: string } {
    const config = this.getConfig({ forceReload: true, strictEnv: false });
    const profiles = config.brain.profiles ?? {};
    const profile = profiles[profileName];
    if (!profile) {
      throw new Error(`profile "${profileName}" not found`);
    }

    const resolved = this.resolveProfileModel(profileName, profile);
    const targetModel = (model ?? resolved.model ?? '').trim();
    if (!targetModel) {
      throw new Error('target model is empty');
    }
    const modelList = Array.isArray(profile.models)
      ? profile.models.filter((m) => typeof m === 'string' && m.trim())
      : undefined;
    if (modelList && modelList.length > 0 && !modelList.includes(targetModel)) {
      throw new Error(`model "${targetModel}" is not in profile "${profileName}" models list`);
    }

    // 1) config.json：brain.defaultProfile
    const configRaw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    if (!configRaw.brain || typeof configRaw.brain !== 'object') {
      throw new Error('config.json brain section is invalid');
    }
    configRaw.brain.defaultProfile = profileName;
    this.writeJsonAtomic(this.configPath, configRaw);

    // 2) profiles.json：defaultModel（仅显式指定模型时写）
    if (model && fs.existsSync(this.profilesPath)) {
      const profilesRaw = JSON.parse(fs.readFileSync(this.profilesPath, 'utf-8'));
      const target = profilesRaw.profiles?.[profileName];
      if (target) {
        target.defaultModel = targetModel;
        if (Array.isArray(target.models)) {
          if (!target.models.includes(targetModel)) {
            target.models.push(targetModel);
          }
        } else {
          target.models = [targetModel];
        }
        this.writeJsonAtomic(this.profilesPath, profilesRaw);
      }
    }

    this.cachedConfig = null;
    return { profile: profileName, model: targetModel };
  }

  /** JSON 原子写：先写临时文件再 rename，避免写一半被读 */
  private writeJsonAtomic(filePath: string, data: unknown): void {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
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

    const profilesRaw = this.isObject(raw.brain.profiles)
      ? raw.brain.profiles
      : undefined;
    if (raw.brain.profiles !== undefined && !profilesRaw) {
      errors.push('brain.profiles must be an object when provided');
      return { valid: false, errors, warnings };
    }

    const profileEntries = Object.entries(profilesRaw ?? {});
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

      const singleModel = typeof profile.model === 'string' ? profile.model.trim() : '';
      const modelList = Array.isArray(profile.models)
        ? profile.models.filter((m) => typeof m === 'string').map((m) => m.trim()).filter(Boolean)
        : [];
      if (!singleModel && modelList.length === 0) {
        errors.push(
          `profile "${profileName}" must define non-empty model or non-empty models[]`,
        );
      }
      if (profile.models !== undefined) {
        if (
          !Array.isArray(profile.models) ||
          profile.models.some((m) => typeof m !== 'string' || !m.trim())
        ) {
          errors.push(`profile "${profileName}" has invalid models (must be non-empty string[])`);
        }
      }
      if (profile.defaultModel !== undefined) {
        if (typeof profile.defaultModel !== 'string' || !profile.defaultModel.trim()) {
          errors.push(`profile "${profileName}" has invalid defaultModel`);
        } else if (modelList.length > 0 && !modelList.includes(profile.defaultModel.trim())) {
          errors.push(
            `profile "${profileName}" defaultModel "${profile.defaultModel}" must exist in models[]`,
          );
        }
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
      this.isObject(profilesRaw) &&
      !Object.prototype.hasOwnProperty.call(profilesRaw, defaultProfile)
    ) {
      errors.push(`defaultProfile "${defaultProfile}" does not exist in brain.profiles`);
    }

    if (this.isObject(profilesRaw)) {
      for (const [profileName, profile] of Object.entries(profilesRaw)) {
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

    const rawConfig = parsed as SecretaryConfig;
    const profilesFile = this.loadProfilesFromDisk();
    const mergedProfiles = this.resolveProfiles(rawConfig, profilesFile);
    const normalizedProfiles = Object.fromEntries(
      Object.entries(mergedProfiles).map(([name, profile]) => [
        name,
        this.resolveProfileModel(name, profile),
      ]),
    );
    const mergedBrain: SecretaryConfig['brain'] = {
      ...rawConfig.brain,
      profiles: normalizedProfiles,
    };
    return {
      ...rawConfig,
      brain: mergedBrain,
    };
  }

  private loadProfilesFromDisk(): ProfilesConfigFile | undefined {
    if (!fs.existsSync(this.profilesPath)) {
      return undefined;
    }
    const text = fs.readFileSync(this.profilesPath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`profiles JSON parse error: ${(error as Error).message}`);
    }
    if (!this.isObject(parsed)) {
      throw new Error(`profiles file must be an object: ${this.profilesPath}`);
    }
    const version = parsed.version;
    if (!Number.isInteger(version) || version < 1) {
      throw new Error(`profiles.version must be an integer >= 1: ${this.profilesPath}`);
    }
    if (!this.isObject(parsed.profiles)) {
      throw new Error(`profiles.profiles must be an object: ${this.profilesPath}`);
    }
    return parsed as ProfilesConfigFile;
  }

  private resolveProfiles(
    config: SecretaryConfig,
    profilesFile: ProfilesConfigFile | undefined,
  ): Record<string, BrainModelProfileConfig> {
    const inConfig = this.isObject(config.brain?.profiles)
      ? (config.brain.profiles as Record<string, BrainModelProfileConfig>)
      : {};
    const inFile = profilesFile?.profiles ?? {};
    if (Object.keys(inFile).length > 0 && Object.keys(inConfig).length > 0) {
      this.logger.warn(
        'Both config.json brain.profiles and profiles.json exist; profiles.json takes precedence on conflicts',
      );
    }
    return {
      ...inConfig,
      ...inFile,
    };
  }

  private resolveProfileModel(
    profileName: string,
    profile: BrainModelProfileConfig,
  ): BrainModelProfileConfig {
    const singleModel = typeof profile.model === 'string' ? profile.model.trim() : '';
    const modelList = Array.isArray(profile.models)
      ? profile.models.filter((m) => typeof m === 'string').map((m) => m.trim()).filter(Boolean)
      : [];
    const defaultModel =
      typeof profile.defaultModel === 'string' ? profile.defaultModel.trim() : '';
    const resolvedModel =
      singleModel ||
      defaultModel ||
      modelList[0];
    if (!resolvedModel) {
      throw new Error(`profile "${profileName}" has no resolved model`);
    }
    return {
      ...profile,
      model: resolvedModel,
      ...(modelList.length > 0 ? { models: modelList } : {}),
      ...(defaultModel ? { defaultModel } : {}),
    };
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
