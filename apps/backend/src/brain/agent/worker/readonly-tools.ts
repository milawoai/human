import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { WorkerOutcome } from '@/motor/jobs/jobs.types';
import { JobError } from '@/motor/jobs/jobs.errors';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import type { WorkspacePolicy } from './workspace-policy';

export function createReadonlyJobTools(policy: WorkspacePolicy, cwd: string, signal: AbortSignal) {
  const evidence: NonNullable<WorkerOutcome['evidence']> = [];
  let calls = 0, bytes = 0;
  const parameters = Type.Object({ path: Type.String({ minLength: 1 }) }, { additionalProperties: false });
  const tools: AgentTool[] = ['read', 'ls'].map(name => ({
    name, label: name === 'read' ? 'Read workspace text' : 'List workspace directory',
    description: name === 'read' ? 'Read a UTF-8 file inside the authorized workspace. No symlinks.'
      : 'List one authorized directory, up to 500 entries. Symlinks are never followed.',
    parameters,
    async execute(_id, args: { path: string }) {
      signal.throwIfAborted();
      if (++calls > 20) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job tool call budget exceeded');
      if (name === 'ls') {
        const text = policy.list(cwd, args.path).join('\n');
        bytes += Buffer.byteLength(text);
        if (bytes > 2 * 1024 * 1024) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job IO budget exceeded');
        evidence.push({ path: relative(policy.root, resolve(cwd, args.path)) || '.',
          contentHash: createHash('sha256').update(text).digest('hex') });
        return { content: [{ type: 'text', text }], details: {} };
      }
      const result = policy.read(cwd, args.path, 2 * 1024 * 1024 - bytes);
      bytes += result.bytes;
      if (bytes > 2 * 1024 * 1024) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job read budget exceeded');
      evidence.push(result.evidence);
      return { content: [{ type: 'text', text: result.text }], details: { evidence: result.evidence } };
    },
  }));
  return { tools, evidence, exhausted: () => calls >= 20 };
}
