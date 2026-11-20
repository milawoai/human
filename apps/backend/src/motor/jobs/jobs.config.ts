export const DEFAULT_JOB_PROMPT_MAX_CHARS = 100_000;
const MAX_JOB_PROMPT_MAX_CHARS = 1_000_000;

export function configuredJobPromptMaxChars(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const value = env.HUMAN_JOB_PROMPT_MAX_CHARS;
  if (value === undefined) return DEFAULT_JOB_PROMPT_MAX_CHARS;
  if (!/^\d+$/.test(value)) return undefined;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_JOB_PROMPT_MAX_CHARS ? limit : undefined;
}

/** Leave room for UTF-8 JSON payloads plus Neural envelope fields. */
export function configuredJobJsonBodyLimit(env: NodeJS.ProcessEnv = process.env): string {
  const promptChars = configuredJobPromptMaxChars(env) ?? DEFAULT_JOB_PROMPT_MAX_CHARS;
  return `${promptChars * 4 + 16_384}b`;
}
