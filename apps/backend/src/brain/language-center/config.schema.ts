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
      required: ['defaultProfile', 'profiles'],
      properties: {
        defaultProfile: { type: 'string', minLength: 1 },
        profiles: {
          type: 'object',
          minProperties: 1,
          additionalProperties: {
            type: 'object',
            required: ['provider', 'model'],
          },
        },
      },
    },
  },
} as const;
