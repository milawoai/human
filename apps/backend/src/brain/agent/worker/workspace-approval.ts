import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { JobApprovalTarget } from '@/motor/jobs/jobs.types';
import { JobError } from '@/motor/jobs/jobs.errors';
import { WorkspacePolicy } from './workspace-policy';

export function workspaceApproval(policy: WorkspacePolicy, cwd: string, signal: AbortSignal,
  approve?: (target: JobApprovalTarget) => Promise<boolean>) {
  const asked = new Set<string>();
  const deny = (message: string): never => { throw new JobError('JOB_WORKSPACE_DENIED', message); };
  return async (operation: JobApprovalTarget['operation'], input: string, allowMissing = false) => {
    if (!input || input.includes('\0')) return deny('Invalid Job path');
    const path = resolve(cwd, input);
    const local = relative(policy.root, path);
    if (local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local)) {
      return { policy, cwd, input: relative(cwd, path) || '.' };
    }
    if (!approve) return deny('Path is outside the authorized workspace');
    const canonical = () => {
      try { return realpathSync(path); }
      catch (error) {
        if (!allowMissing || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return resolve(realpathSync(dirname(path)), basename(path));
      }
    };
    if (canonical() !== path) return deny('Use the canonical path. Symbolic links are blocked');
    const root = operation === 'ls' ? path : dirname(path);
    const scoped = new WorkspacePolicy(root, () => {
      signal.throwIfAborted();
      policy.assertCurrentGrant();
      if (canonical() !== path) deny('Path changed after the approval request');
    });
    policy.assertCurrentGrant();
    const key = `${operation}\0${path}`;
    if (asked.has(key)) return deny('This Job already requested this operation on this path');
    asked.add(key);
    if (!await approve({ operation, path, workspaceRoot: policy.root })) {
      return deny('Permission denied, expired, or desktop approval unavailable');
    }
    signal.throwIfAborted();
    return { policy: scoped, cwd: root, input: relative(root, path) || '.' };
  };
}
