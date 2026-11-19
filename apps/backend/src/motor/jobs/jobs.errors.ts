export type JobErrorCode = 'JOB_INVALID_INPUT' | 'JOB_BUSY'
  | 'JOB_IDEMPOTENCY_CONFLICT' | 'JOB_SCOPE_MISMATCH'
  | 'JOB_STALE_VERSION' | 'JOB_INVALID_TRANSITION' | 'JOB_NOT_FOUND'
  | 'JOB_RESULT_NOT_READY' | 'JOB_OWNER_MISMATCH' | 'JOB_CAPACITY'
  | 'JOB_STORAGE_BUSY' | 'JOB_SCHEMA_INCOMPATIBLE'
  | 'JOB_EXECUTOR_CONFLICT' | 'JOB_EXECUTOR_UNAVAILABLE';

export class JobError extends Error {
  constructor(readonly code: JobErrorCode, message: string) {
    super(message);
    this.name = 'JobError';
  }
}
