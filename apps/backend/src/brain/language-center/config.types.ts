export interface OAuthAuthConfig {
  type: 'oauth';
  provider: string;
}

export interface BrainModelProfileConfig {
  provider: string;
  model?: string;
  models?: string[];
  defaultModel?: string;
  api?: 'openai-completions' | 'responses' | 'chat-completions';
  baseUrl?: string;
  apiKeyEnv?: string;
  reasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  thinkingLevel?: 'low' | 'medium' | 'high';
  temperature?: number;
  auth?: OAuthAuthConfig;
  enabled?: boolean;
  notes?: string;
}

export interface BrainSectionConfig {
  defaultProfile: string;
  profiles: Record<string, BrainModelProfileConfig>;
}

export interface ProfilesConfigFile {
  version: number;
  profiles: Record<string, BrainModelProfileConfig>;
}

export interface MemoryChunkConfig {
  minChars: number;
  maxChars: number;
  overlapChars: number;
}

export interface MemorySectionConfig {
  dbPath?: string;
  obsidianVaultPath?: string;
  ignoreDirs?: string[];
  includeExts?: string[];
  chunk?: Partial<MemoryChunkConfig>;
}

export interface SecretaryConfig {
  version: number;
  brain: BrainSectionConfig;
  memory?: MemorySectionConfig;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PiProviderModel {
  id: string;
  name: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
}

export interface PiProviderDefinition {
  baseUrl: string;
  apiKey?: string;
  api: 'openai-completions' | 'responses' | 'chat-completions';
  models: PiProviderModel[];
}

export interface PiModelsRegistry {
  providers: Record<string, PiProviderDefinition>;
}
