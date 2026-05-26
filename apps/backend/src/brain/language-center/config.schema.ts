/**
 * 配置结构文档化 Schema（用于对齐外部 config.schema.json）。
 * 运行时校验由 ModelConfigService 实现，避免额外依赖。
 */
export const CONFIG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'AI Secretary Config',
  type: 'object',
  required: ['version', 'brain'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    brain: {
      type: 'object',
      required: ['defaultProfile'],
      properties: {
        defaultProfile: { type: 'string' },
        profiles: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['provider'],
          },
        },
      },
    },
    memory: {
      type: 'object',
      required: ['obsidianVaultPath'],
      properties: {
        dbPath: { type: 'string', minLength: 1 },
        obsidianVaultPath: { type: 'string', minLength: 1 },
        ignoreDirs: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        includeExts: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
        },
        chunk: {
          type: 'object',
          properties: {
            minChars: { type: 'integer', minimum: 1 },
            maxChars: { type: 'integer', minimum: 1 },
            overlapChars: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
  },
} as const;
