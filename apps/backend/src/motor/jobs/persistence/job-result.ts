import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { JobError } from '../jobs.errors';
import type { WorkerOutcome } from '../jobs.types';

export interface StoredJobResult {
  resultRef: string;
  report: string;
  evidence: NonNullable<WorkerOutcome['evidence']>;
  createdAt: number;
}

/** Called only inside the same transaction as the terminal state update. */
export function insertJobResult(db: Database, jobId: string, outcome: WorkerOutcome, now: number): string {
  const report = outcome.report ?? '';
  const evidence = outcome.evidence ?? [];
  if (!['succeeded', 'failed', 'cancelled'].includes(outcome.outcome)
    || typeof report !== 'string' || Buffer.byteLength(report, 'utf8') > 64 * 1024
    || !Array.isArray(evidence) || evidence.length > 100
    || (outcome.outcome === 'succeeded' && !report.trim())) {
    throw new JobError('JOB_INVALID_INPUT', 'Invalid worker outcome or result budget exceeded');
  }
  for (const item of evidence) {
    if (!item || typeof item.path !== 'string' || !item.path.trim()
      || (item.startLine !== undefined && (!Number.isSafeInteger(item.startLine) || item.startLine < 1))
      || (item.endLine !== undefined && (!Number.isSafeInteger(item.endLine) || item.endLine < (item.startLine ?? 1)))) {
      throw new JobError('JOB_INVALID_INPUT', 'Invalid worker evidence');
    }
  }
  const resultRef = randomUUID();
  db.prepare(`INSERT INTO motor_job_results (result_ref, job_id, report, evidence_json, created_at)
    VALUES (?, ?, ?, ?, ?)`).run(resultRef, jobId, report, JSON.stringify(evidence), now);
  return resultRef;
}

export function readJobResult(db: Database, jobId: string): StoredJobResult {
  const row = db.prepare('SELECT * FROM motor_job_results WHERE job_id = ?').get(jobId) as
    { result_ref: string; report: string; evidence_json: string; created_at: number } | undefined;
  if (!row) throw new JobError('JOB_RESULT_NOT_READY', 'No worker result is available for this job');
  return { resultRef: row.result_ref, report: row.report, evidence: JSON.parse(row.evidence_json), createdAt: row.created_at };
}
