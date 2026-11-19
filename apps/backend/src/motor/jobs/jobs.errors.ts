export type JobErrorCode = 'JOB_INVALID_INPUT' | 'JOB_BUSY'
  | 'JOB_IDEMPOTENCY_CONFLICT' | 'JOB_SCOPE_MISMATCH'
  | 'JOB_STALE_VERSION' | 'JOB_INVALID_TRANSITION';

export class JobError extends Error {
  constructor(readonly code: JobErrorCode, message: string) {
    super(message);
    this.name = 'JobError';
  }
}
