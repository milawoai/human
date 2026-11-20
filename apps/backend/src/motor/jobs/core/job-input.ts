import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { JobError } from '../jobs.errors';
import { DEFAULT_JOB_PROMPT_MAX_CHARS } from '../jobs.config';
import type { SubmitJob } from '../jobs.types';

function invalid(message: string): never {
  throw new JobError('JOB_INVALID_INPUT', message);
}

function object(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key)) invalid(`${name}.${key} is not supported`);
  return record;
}

function text(value: unknown, name: string, max?: number): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) invalid(`${name} must be nonempty text without NUL`);
  if (max !== undefined && value.length > max) invalid(`${name} exceeds ${max} characters`);
  return value;
}

/** Syntax validation only. Workspace authorization/realpath belongs at the IO boundary. */
export function parseSubmitJob(value: unknown, maxPromptChars = DEFAULT_JOB_PROMPT_MAX_CHARS): SubmitJob {
  if (!Number.isSafeInteger(maxPromptChars) || maxPromptChars < 1) invalid('Job prompt limit configuration is invalid');
  const payload = object(value, ['idempotencyKey', 'kind', 'spec'], 'payload');
  if (payload.kind !== 'pi-workspace') invalid('payload.kind must be pi-workspace');
  const spec = object(payload.spec, ['prompt', 'workspaceId', 'workspace', 'cwd', 'profileName'], 'payload.spec');
  const cwd = text(spec.cwd, 'payload.spec.cwd');
  if (cwd.startsWith('/') || cwd.startsWith('\\') || /^[A-Za-z]:/.test(cwd)
    || cwd.split(/[\\/]/).some(part => part === '..')) invalid('payload.spec.cwd must stay inside its authorized workspace');
  const workspace = spec.workspace === undefined ? undefined : text(spec.workspace, 'payload.spec.workspace', 4096);
  if (workspace !== undefined && !isAbsolute(workspace)) invalid('payload.spec.workspace must be an absolute path');
  return {
    idempotencyKey: text(payload.idempotencyKey, 'payload.idempotencyKey', 128),
    kind: 'pi-workspace',
    spec: {
      prompt: text(spec.prompt, 'payload.spec.prompt', maxPromptChars),
      ...(spec.workspaceId === undefined ? {} : { workspaceId: text(spec.workspaceId, 'payload.spec.workspaceId', 128) }),
      ...(workspace === undefined ? {} : { workspace }),
      cwd,
      ...(spec.profileName === undefined ? {} : { profileName: text(spec.profileName, 'payload.spec.profileName') }),
    },
  };
}

/** Fixed field order; preserve exact text/path/profile meaning rather than silently rewriting requests. */
export function fingerprintJob(input: SubmitJob): string {
  return createHash('sha256').update(JSON.stringify([
    input.kind, input.spec.workspaceId ?? null, input.spec.prompt, input.spec.cwd, input.spec.profileName ?? null,
  ])).digest('hex');
}
