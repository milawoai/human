import { JobError } from '../jobs.errors';
import type { JobAdmissionIdentity, JobAdmissionRecord } from '../jobs.types';

export type JobAdmission = { kind: 'create' } | { kind: 'reuse'; jobId: string };

/**
 * Pure decision only: the repository must read identity + GLOBAL slot and insert
 * within one write transaction. This function alone does not provide locking.
 */
export function decideJobAdmission(
  request: JobAdmissionIdentity,
  existing: JobAdmissionRecord | undefined,
  slotOccupied: boolean,
): JobAdmission {
  if (existing) {
    if (existing.scopeKey !== request.scopeKey || existing.idempotencyKey !== request.idempotencyKey) {
      throw new JobError('JOB_SCOPE_MISMATCH', 'Repository returned a job outside the requested identity');
    }
    if (existing.specHash !== request.specHash) {
      throw new JobError('JOB_IDEMPOTENCY_CONFLICT', 'Idempotency key already belongs to a different execution specification');
    }
    return { kind: 'reuse', jobId: existing.jobId };
  }
  if (slotOccupied) throw new JobError('JOB_BUSY', 'The background worker is busy; no job was accepted');
  return { kind: 'create' };
}
