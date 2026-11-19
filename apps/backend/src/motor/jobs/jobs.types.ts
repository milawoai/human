export type JobState = 'accepted' | 'running' | 'cancelling'
  | 'succeeded' | 'failed' | 'cancelled' | 'unknown';

export interface SubmitJob {
  idempotencyKey: string;
  kind: 'pi-readonly';
  spec: { prompt: string; cwd: string; profileName?: string };
}

export interface JobFailure { code: string; message: string }
export interface JobProgress { message: string; completed?: number; total?: number }
export interface JobSnapshot {
  jobId: string;
  kind: 'pi-readonly';
  state: JobState;
  seq: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  progress?: JobProgress;
  resultRef?: string;
  error?: JobFailure;
  cancelRequestedAt?: number;
  reason?: string;
}

export interface WorkerOutcome {
  outcome: 'succeeded' | 'failed' | 'cancelled';
  report?: string;
  evidence?: Array<{ path: string; startLine?: number; endLine?: number; contentHash?: string }>;
  error?: JobFailure;
}

export interface JobExecutor {
  execute(spec: SubmitJob['spec'], context: {
    jobId: string;
    signal: AbortSignal;
    progress(update: JobProgress): Promise<void>;
  }): Promise<WorkerOutcome>;
}

/** Internal identity: scope comes from the host, never from the submit payload. */
export interface JobAdmissionIdentity {
  scopeKey: string;
  idempotencyKey: string;
  specHash: string;
}
export interface JobAdmissionRecord extends JobAdmissionIdentity {
  jobId: string;
  state: JobState;
}
