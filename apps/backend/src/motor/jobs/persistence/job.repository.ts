import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { JobError } from '../jobs.errors';
import type { JobSnapshot, JobProgress, WorkerOutcome } from '../jobs.types';
import { parseSubmitJob, fingerprintJob } from '../core/job-input';
import { decideJobAdmission } from '../core/job-admission';
import { transitionJob, type JobTransition } from '../core/job-state';
import { jobDatabase, jobTransaction } from './job-database';
import { initializeJobSchema } from './job-schema';
import { jobSnapshot, storedSpec, type JobRow } from './job-row';
import { validateJobProgress } from '../core/job-progress';
import { insertJobResult, readJobResult } from './job-result';

export class JobRepository {
  private readonly db;
  private initialized = false;

  constructor(source: DataSource, private readonly ownerInstanceId: string, private readonly capacity = 5000) {
    this.db = jobDatabase(source);
    if (!ownerInstanceId.trim() || !Number.isSafeInteger(capacity) || capacity < 1) {
      throw new JobError('JOB_INVALID_INPUT', 'Invalid host identity or retention capacity');
    }
  }

  initialize(): void {
    this.initialized = false;
    initializeJobSchema(this.db);
    this.initialized = true;
  }

  /** Workspace authorization and proven host ownership must precede this internal API. */
  submit(scopeKey: string, value: unknown, now: number): { job: JobSnapshot; reused: boolean } {
    this.ready();
    if (!scopeKey.trim() || !Number.isSafeInteger(now) || now < 0) {
      throw new JobError('JOB_INVALID_INPUT', 'Invalid scope or timestamp');
    }
    const input = parseSubmitJob(value);
    const request = { scopeKey, idempotencyKey: input.idempotencyKey, specHash: fingerprintJob(input) };
    return jobTransaction(this.db, () => {
      const row = this.db.prepare('SELECT * FROM motor_jobs WHERE scope_key = ? AND idempotency_key = ?')
        .get(scopeKey, input.idempotencyKey) as JobRow | undefined;
      const busy = !!this.db.prepare("SELECT 1 FROM motor_jobs WHERE state IN ('accepted','running','cancelling') LIMIT 1").get();
      const decision = decideJobAdmission(request, row ? { scopeKey: row.scope_key,
        idempotencyKey: row.idempotency_key, specHash: row.spec_hash, jobId: row.job_id, state: row.state } : undefined, busy);
      if (decision.kind === 'reuse') return { job: jobSnapshot(row!), reused: true };
      const count = this.db.prepare("SELECT count(*) AS n FROM motor_jobs WHERE state NOT IN ('accepted','running','cancelling')")
        .get() as { n: number };
      if (count.n >= this.capacity) throw new JobError('JOB_CAPACITY', 'Job retention limit reached; explicit maintenance is required');
      const jobId = randomUUID();
      this.db.prepare(`INSERT INTO motor_jobs (job_id, scope_key, idempotency_key, spec_hash, spec_json,
        state, seq, owner_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'accepted', 1, ?, ?)`)
        .run(jobId, scopeKey, input.idempotencyKey, request.specHash, JSON.stringify(input.spec), this.ownerInstanceId, now);
      return { job: jobSnapshot(this.row(scopeKey, jobId)), reused: false };
    });
  }

  get(scopeKey: string, jobId: string): JobSnapshot {
    this.ready();
    return jobSnapshot(this.row(scopeKey, jobId));
  }

  result(scopeKey: string, jobId: string) {
    this.ready();
    this.row(scopeKey, jobId); // scope/not-found validation before looking up results
    return readJobResult(this.db, jobId);
  }

  executionSpec(scopeKey: string, jobId: string) {
    this.ready();
    return storedSpec(this.ownedRow(scopeKey, jobId));
  }

  progress(scopeKey: string, jobId: string, update: JobProgress, now: number): JobSnapshot {
    this.ready();
    const progress = validateJobProgress(update);
    return jobTransaction(this.db, () => {
      const row = this.ownedRow(scopeKey, jobId);
      if (row.state !== 'running' && row.state !== 'cancelling') {
        throw new JobError('JOB_INVALID_TRANSITION', 'Only an active executor can update progress');
      }
      const current = jobSnapshot(row);
      if (!Number.isSafeInteger(now) || now < Math.max(current.createdAt, current.startedAt ?? 0, current.cancelRequestedAt ?? 0)
        || !Number.isSafeInteger(current.seq + 1)) throw new JobError('JOB_INVALID_INPUT', 'Invalid progress time or version');
      const next = { ...current, progress, seq: row.seq + 1 };
      this.update(row, next);
      return next;
    });
  }

  transition(scopeKey: string, jobId: string, seq: number, event: Exclude<JobTransition, { type: 'settle' }>, now: number): JobSnapshot {
    this.ready();
    return jobTransaction(this.db, () => {
      const row = this.ownedRow(scopeKey, jobId);
      const current = jobSnapshot(row);
      const next = transitionJob(current, seq, event, now);
      if (next !== current) this.update(row, next);
      return next;
    });
  }

  settle(scopeKey: string, jobId: string, seq: number, outcome: WorkerOutcome, now: number): JobSnapshot {
    this.ready();
    return jobTransaction(this.db, () => {
      const row = this.ownedRow(scopeKey, jobId);
      // Validate lifecycle/CAS before allocating any result record.
      const next = transitionJob(jobSnapshot(row), seq, { type: 'settle', outcome: outcome.outcome, error: outcome.error }, now);
      next.resultRef = insertJobResult(this.db, jobId, outcome, now);
      this.update(row, next);
      return next;
    });
  }

  private ready(): void {
    if (!this.initialized) throw new JobError('JOB_SCHEMA_INCOMPATIBLE', 'Job schema has not been validated');
    if (this.db.inTransaction) throw new JobError('JOB_STORAGE_BUSY', 'Another operation owns the shared transaction');
  }

  private row(scopeKey: string, jobId: string): JobRow {
    const row = this.db.prepare('SELECT * FROM motor_jobs WHERE job_id = ? AND scope_key = ?').get(jobId, scopeKey) as JobRow | undefined;
    if (!row) throw new JobError('JOB_NOT_FOUND', 'Job not found in this scope');
    return row;
  }

  private ownedRow(scopeKey: string, jobId: string): JobRow {
    const row = this.row(scopeKey, jobId);
    if (row.owner_instance_id !== this.ownerInstanceId) throw new JobError('JOB_OWNER_MISMATCH', 'Job belongs to a different host instance');
    return row;
  }

  private update(row: JobRow, next: JobSnapshot): void {
    const result = this.db.prepare(`UPDATE motor_jobs SET state = ?, seq = ?, started_at = ?, finished_at = ?,
      cancel_requested_at = ?, result_ref = ?, error_json = ?, reason = ?, progress_json = ?
      WHERE job_id = ? AND scope_key = ? AND state = ? AND seq = ? AND owner_instance_id = ?`)
      .run(next.state, next.seq, next.startedAt ?? null, next.finishedAt ?? null, next.cancelRequestedAt ?? null,
        next.resultRef ?? null, next.error ? JSON.stringify(next.error) : null, next.reason ?? null,
        next.progress ? JSON.stringify(next.progress) : null,
        row.job_id, row.scope_key, row.state, row.seq, this.ownerInstanceId);
    if (result.changes !== 1) throw new JobError('JOB_STALE_VERSION', 'Job owner or state changed before commit');
  }
}
