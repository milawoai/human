import type { Database } from 'better-sqlite3';
import { JobError } from '../jobs.errors';
import { jobTransaction } from './job-database';

// Deliberately unmanaged by TypeORM synchronize. Versioned, additive DDL on the shared DataSource.
const definitions = {
  motor_job_schema: `CREATE TABLE motor_job_schema (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), version INTEGER NOT NULL)`,
  motor_jobs: `CREATE TABLE motor_jobs (
    job_id TEXT PRIMARY KEY NOT NULL, scope_key TEXT NOT NULL, idempotency_key TEXT NOT NULL,
    spec_hash TEXT NOT NULL, spec_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('accepted','running','cancelling','succeeded','failed','cancelled','unknown')),
    seq INTEGER NOT NULL CHECK(seq >= 1), owner_instance_id TEXT NOT NULL,
    created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, cancel_requested_at INTEGER,
    progress_json TEXT, result_ref TEXT, error_json TEXT, reason TEXT,
    UNIQUE(scope_key, idempotency_key))`,
  motor_job_results: `CREATE TABLE motor_job_results (
    result_ref TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL UNIQUE REFERENCES motor_jobs(job_id),
    report TEXT NOT NULL, evidence_json TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  motor_jobs_dispatch: 'CREATE INDEX motor_jobs_dispatch ON motor_jobs(state, created_at)',
  motor_jobs_active_slot: `CREATE UNIQUE INDEX motor_jobs_active_slot ON motor_jobs((1))
    WHERE state IN ('accepted','running','cancelling')`,
};
const normalized = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();
const incompatible = (): never => { throw new JobError('JOB_SCHEMA_INCOMPATIBLE', 'Unsupported Job schema; migration is required'); };

export function initializeJobSchema(db: Database): void {
  jobTransaction(db, () => {
    const names = Object.keys(definitions);
    const present = db.prepare(`SELECT name, sql FROM sqlite_master WHERE name IN (${names.map(() => '?').join(',')})`)
      .all(...names) as Array<{ name: string; sql: string }>;
    if (present.length === 0) {
      for (const sql of Object.values(definitions)) db.exec(sql);
      db.prepare('INSERT INTO motor_job_schema (singleton, version) VALUES (1, 1)').run();
    } else {
      if (present.length !== names.length) incompatible();
      for (const row of present) {
        if (normalized(row.sql) !== normalized(definitions[row.name as keyof typeof definitions])) incompatible();
      }
      const versions = db.prepare('SELECT version FROM motor_job_schema').all() as Array<{ version: number }>;
      if (versions.length !== 1 || versions[0].version !== 1) incompatible();
    }
  });
}
