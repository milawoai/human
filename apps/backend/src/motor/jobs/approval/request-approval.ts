import { approvalChannel } from '@/runtime/job-approval-channel';
import type { JobApprovalTarget, JobSnapshot } from '../jobs.types';
import type { JobRepository } from '../persistence/job.repository';
import { JobError } from '../jobs.errors';

export async function requestApproval(repository: JobRepository, scope: string, jobId: string, target: JobApprovalTarget,
  signal: AbortSignal, changed: (job: JobSnapshot) => void): Promise<boolean> {
  signal.throwIfAborted();
  if (!approvalChannel.available()) throw new JobError('JOB_WORKSPACE_DENIED', 'Desktop approval unavailable for this backend');
  const now = Date.now();
  const configured = Number(process.env.HUMAN_JOB_APPROVAL_TIMEOUT_MS);
  const timeout = Number.isSafeInteger(configured) && configured > 0 && configured <= 600_000 ? configured : 120_000;
  const { job, approval } = repository.beginApproval(scope, jobId, target, now, now + timeout);
  let close: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const finish = (status: 'approved' | 'denied' | 'expired') => {
        try {
          const decidedAt = Date.now();
          const actual = decidedAt >= approval.expiresAt ? 'expired' : status;
          changed(repository.finishApproval(scope, approval, actual, decidedAt));
          resolve(actual === 'approved');
          return actual === 'approved';
        } catch (error) { reject(error); return false; }
      };
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => finish('expired'), timeout);
      try {
        close = approvalChannel.request(approval, (id, seq, decision) => {
          if (signal.aborted || id !== approval.approvalId || seq !== approval.seq) return false;
          return finish(decision === 'deny' ? 'denied' : 'approved');
        });
        changed(job);
      } catch { finish('denied'); }
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
    close?.();
  }
}
