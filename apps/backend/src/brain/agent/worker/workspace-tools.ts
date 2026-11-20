import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { WorkerOutcome } from '@/motor/jobs/jobs.types';
import { JobError } from '@/motor/jobs/jobs.errors';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import type { WorkspacePolicy } from './workspace-policy';

const readWritePath = Type.Object({ path: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const writePath = Type.Object({ path: Type.String({ minLength: 1 }), content: Type.String(),
  overwrite: Type.Optional(Type.Boolean()) }, { additionalProperties: false });

export function createJobWorkspaceTools(policy: WorkspacePolicy, cwd: string, signal: AbortSignal) {
  const evidence: NonNullable<WorkerOutcome['evidence']> = [];
  let calls = 0, bytes = 0;
  const tools: AgentTool[] = [
    {
      name: 'read', label: 'Read workspace text',
      description: 'Read a UTF-8 file inside the user-authorized workspace. Paths are relative; symlinks are blocked.',
      parameters: readWritePath,
      async execute(_id, args: { path: string }) {
        signal.throwIfAborted();
        if (++calls > 20) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job tool call budget exceeded');
        const result = policy.read(cwd, args.path, 2 * 1024 * 1024 - bytes);
        bytes += result.bytes;
        if (bytes > 2 * 1024 * 1024) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job IO budget exceeded');
        evidence.push(result.evidence);
        return { content: [{ type: 'text', text: result.text }], details: { evidence: result.evidence } };
      },
    },
    {
      name: 'write', label: 'Write workspace text',
      description: 'Create or update one UTF-8 text file inside the user-authorized workspace. Existing files require overwrite=true. No deletion or commands.',
      parameters: writePath,
      async execute(_id, args: { path: string; content: string; overwrite?: boolean }) {
        signal.throwIfAborted();
        if (++calls > 20) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job tool call budget exceeded');
        const result = policy.write(cwd, args.path, args.content, 2 * 1024 * 1024 - bytes, args.overwrite === true);
        bytes += result.bytes;
        if (bytes > 2 * 1024 * 1024) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job IO budget exceeded');
        evidence.push(result.evidence);
        return { content: [{ type: 'text', text: `Wrote ${result.evidence.path} (${result.bytes} bytes)` }],
          details: { evidence: result.evidence } };
      },
    },
    {
      name: 'ls', label: 'List workspace directory',
      description: 'List one authorized directory, up to 500 entries. Symlinks are never followed.',
      parameters: readWritePath,
      async execute(_id, args: { path: string }) {
        signal.throwIfAborted();
        if (++calls > 20) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job tool call budget exceeded');
        const text = policy.list(cwd, args.path).join('\n');
        const data = Buffer.from(text);
        bytes += data.length;
        if (bytes > 2 * 1024 * 1024) throw new JobError('JOB_BUDGET_EXCEEDED', 'Job IO budget exceeded');
        const item = { path: relative(policy.root, resolve(cwd, args.path)) || '.', contentHash: createHash('sha256').update(data).digest('hex') };
        evidence.push(item);
        return { content: [{ type: 'text', text }], details: { evidence: item } };
      },
    },
  ];
  return { tools, evidence, exhausted: () => calls >= 20 };
}
