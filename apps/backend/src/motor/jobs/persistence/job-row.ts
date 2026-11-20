import type { JobSnapshot, JobState, SubmitJob } from '../jobs.types';

export interface JobRow {
  job_id: string; scope_key: string; idempotency_key: string; spec_hash: string;
  spec_json: string; state: JobState; seq: number; owner_instance_id: string;
  created_at: number; started_at: number | null; finished_at: number | null;
  cancel_requested_at: number | null; progress_json: string | null;
  result_ref: string | null; error_json: string | null; reason: string | null;
}

export function jobSnapshot(row: JobRow): JobSnapshot {
  return {
    jobId: row.job_id, kind: 'pi-workspace', state: row.state, seq: row.seq,
    createdAt: row.created_at,
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
    ...(row.cancel_requested_at === null ? {} : { cancelRequestedAt: row.cancel_requested_at }),
    ...(row.progress_json === null ? {} : { progress: JSON.parse(row.progress_json) }),
    ...(row.result_ref === null ? {} : { resultRef: row.result_ref }),
    ...(row.error_json === null ? {} : { error: JSON.parse(row.error_json) }),
    ...(row.reason === null ? {} : { reason: row.reason }),
  };
}

export function storedSpec(row: JobRow): SubmitJob['spec'] { return JSON.parse(row.spec_json); }
