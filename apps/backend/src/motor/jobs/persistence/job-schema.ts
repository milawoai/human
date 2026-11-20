import type { Database } from 'better-sqlite3';
import { JobError } from '../jobs.errors';
import { jobTransaction } from './job-database';

// Deliberately unmanaged by TypeORM synchronize. Versioned, additive DDL on the shared DataSource.
export const legacyJobSchema = {
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
const definitions = {
  ...legacyJobSchema,
  motor_jobs: legacyJobSchema.motor_jobs.replace("'running','cancelling'", "'running','awaiting_approval','cancelling'"),
  motor_jobs_active_slot: legacyJobSchema.motor_jobs_active_slot.replace("'running','cancelling'", "'running','awaiting_approval','cancelling'"),
  motor_job_approvals: `CREATE TABLE motor_job_approvals (
    approval_id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL REFERENCES motor_jobs(job_id),
    job_seq INTEGER NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('read','write','ls')),
    canonical_path TEXT NOT NULL, workspace_root TEXT NOT NULL, reason TEXT,
    status TEXT NOT NULL CHECK(status IN ('pending','approved','denied','expired','invalidated')),
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, decided_at INTEGER, decision_source TEXT,
    UNIQUE(job_id, job_seq))`,
};
const normalized = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();
const runtimeSql = `CREATE TABLE motor_job_runtime (singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  instance_id TEXT NOT NULL, deployment_id TEXT NOT NULL, pid INTEGER NOT NULL,
  started_at TEXT NOT NULL, active INTEGER NOT NULL, updated_at INTEGER NOT NULL)`;
const incompatible = (): never => { throw new JobError('JOB_SCHEMA_INCOMPATIBLE', 'Unsupported Job schema; migration is required'); };

export function initializeJobSchema(db: Database): void {
  jobTransaction(db, () => {
    const names = Object.keys(definitions);
    const present = db.prepare(`SELECT name, sql FROM sqlite_master WHERE name IN (${names.map(() => '?').join(',')})`)
      .all(...names) as Array<{ name: string; sql: string }>;
    if (present.length === 0) {
      for (const sql of Object.values(definitions)) db.exec(sql);
      db.exec(runtimeSql);
      db.prepare('INSERT INTO motor_job_schema (singleton, version) VALUES (1, 3)').run();
    } else {
      if (!present.some(row => row.name === 'motor_job_schema'
        && normalized(row.sql) === normalized(definitions.motor_job_schema))) incompatible();
      const versions = db.prepare('SELECT version FROM motor_job_schema').all() as Array<{ version: number }>;
      if (versions.length !== 1 || ![1, 2, 3].includes(versions[0].version)) incompatible();
      const expected: Record<string, string> = versions[0].version === 3 ? definitions : legacyJobSchema;
      if (present.length !== Object.keys(expected).length) incompatible();
      for (const row of present) {
        if (!expected[row.name] || normalized(row.sql) !== normalized(expected[row.name])) incompatible();
      }
      const runtime = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'motor_job_runtime'").get() as { sql: string } | undefined;
      if (versions[0].version === 1) {
        if (runtime) incompatible();
        db.exec(runtimeSql); // validated, additive v1 -> v2 migration; no Job rows rewritten
      } else if (!runtime || normalized(runtime.sql) !== normalized(runtimeSql)) incompatible();
      if (versions[0].version < 3) migrateApprovalSchema(db);
    }
  });
}

function migrateApprovalSchema(db: Database): void {
  // Rebuild both tables because SQLite cannot alter the state CHECK in place.
  db.exec(`ALTER TABLE motor_job_results RENAME TO motor_job_results_legacy;
    ALTER TABLE motor_jobs RENAME TO motor_jobs_legacy;`);
  db.exec(definitions.motor_jobs);
  db.exec(definitions.motor_job_results);
  db.exec(`INSERT INTO motor_jobs SELECT * FROM motor_jobs_legacy;
    INSERT INTO motor_job_results SELECT * FROM motor_job_results_legacy;
    DROP TABLE motor_job_results_legacy;
    DROP TABLE motor_jobs_legacy;`);
  db.exec(definitions.motor_jobs_dispatch);
  db.exec(definitions.motor_jobs_active_slot);
  db.exec(definitions.motor_job_approvals);
  if (db.prepare('PRAGMA foreign_key_check(motor_job_results)').all().length > 0) incompatible();
  db.prepare('UPDATE motor_job_schema SET version = 3 WHERE singleton = 1').run();
}
