export interface OAuthAuthConfig {
  type: 'oauth';
  provider: string;
}

export interface BrainModelProfileConfig {
  provider: string;
  model: string;
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

export interface SecretaryConfig {
  version: number;
  brain: BrainSectionConfig;
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
