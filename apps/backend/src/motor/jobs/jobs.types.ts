export type JobState = 'accepted' | 'running' | 'awaiting_approval' | 'cancelling'
  | 'succeeded' | 'failed' | 'cancelled' | 'unknown';

export interface SubmitJob {
  idempotencyKey: string;
  kind: 'pi-workspace';
  spec: { prompt: string; workspaceId?: string; workspace?: string; cwd: string; profileName?: string };
}

export interface JobFailure { code: string; message: string }
export interface JobProgress { message: string; completed?: number; total?: number }
export interface JobApprovalTarget { operation: 'read' | 'write' | 'ls'; path: string; workspaceRoot: string }
export interface JobApproval extends JobApprovalTarget { approvalId: string; jobId: string; seq: number; expiresAt: number }
export type JobApprovalDecision = 'once' | 'directory' | 'deny';
export interface JobSnapshot {
  jobId: string;
  kind: 'pi-workspace';
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
  awaitingApproval?: Pick<JobApproval, 'approvalId' | 'operation' | 'path' | 'expiresAt'>;
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
    approve?(target: JobApprovalTarget): Promise<boolean>;
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
