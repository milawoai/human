import { JobError } from '../jobs.errors';
import type { JobSnapshot, JobState, WorkerOutcome } from '../jobs.types';

export type JobTransition = { type: 'dispatch' } | { type: 'cancel' }
  | { type: 'await-approval' } | { type: 'resume-approval' }
  | { type: 'settle'; outcome: WorkerOutcome['outcome']; resultRef?: string; error?: WorkerOutcome['error'] }
  | { type: 'recover'; reason: string };

export function occupiesJobSlot(state: JobState): boolean {
  return state === 'accepted' || state === 'running' || state === 'awaiting_approval' || state === 'cancelling';
}

export function isJobSettled(state: JobState): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'cancelled';
}

/**
 * Returns the same object for an idempotent cancellation; otherwise a new version.
 * Repository CAS must additionally check owner, state and seq in its transaction.
 * recover is host reconciliation after proven owner death, never a worker callback.
 */
export function transitionJob(
  job: JobSnapshot, expectedSeq: number, event: JobTransition, now: number,
): JobSnapshot {
  if (!Number.isSafeInteger(expectedSeq) || expectedSeq !== job.seq) {
    throw new JobError('JOB_STALE_VERSION', 'Job version changed; reload before applying the transition');
  }
  const lastRecordedAt = Math.max(job.createdAt, job.startedAt ?? 0,
    job.cancelRequestedAt ?? 0, job.finishedAt ?? 0);
  if (!Number.isSafeInteger(job.seq) || job.seq < 1 || !Number.isSafeInteger(job.seq + 1)
    || !Number.isFinite(now) || now < lastRecordedAt) {
    throw new JobError('JOB_INVALID_TRANSITION', 'Invalid job sequence or transition time');
  }
  const next = (patch: Partial<JobSnapshot>): JobSnapshot => ({ ...job, ...patch, seq: job.seq + 1 });
  switch (event.type) {
    case 'dispatch':
      if (job.state === 'accepted') return next({ state: 'running', startedAt: now });
      break;
    case 'await-approval':
      if (job.state === 'running') return next({ state: 'awaiting_approval' });
      break;
    case 'resume-approval':
      if (job.state === 'awaiting_approval') return next({ state: 'running' });
      break;
    case 'cancel':
      if (job.state === 'accepted') return next({ state: 'cancelled', cancelRequestedAt: now, finishedAt: now });
      if (job.state === 'running' || job.state === 'awaiting_approval') {
        return next({ state: 'cancelling', cancelRequestedAt: now });
      }
      if (job.state === 'cancelling' || isJobSettled(job.state) || job.state === 'unknown') return job;
      break;
    case 'settle':
      if ((job.state === 'running' || job.state === 'cancelling') && isJobSettled(event.outcome)) {
        return next({ state: event.outcome, finishedAt: now, resultRef: event.resultRef,
          error: event.error ? { ...event.error } : undefined });
      }
      break;
    case 'recover':
      if (occupiesJobSlot(job.state) && event.reason.trim()) {
        return next({ state: 'unknown', finishedAt: now, reason: event.reason });
      }
      break;
  }
  throw new JobError('JOB_INVALID_TRANSITION', `Cannot apply ${event.type} to ${job.state}`);
}
