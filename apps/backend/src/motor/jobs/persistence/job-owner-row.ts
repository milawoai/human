import type { Database } from 'better-sqlite3';
import { JobError } from '../jobs.errors';

export interface JobOwnerRow {
  instance_id: string; deployment_id: string; pid: number; started_at: string; active: number;
}
export function readJobOwner(db: Database): JobOwnerRow | undefined {
  return db.prepare('SELECT * FROM motor_job_runtime WHERE singleton = 1').get() as JobOwnerRow | undefined;
}
export function assertJobOwner(db: Database, instanceId: string): void {
  const owner = readJobOwner(db);
  // Empty ownership table is allowed only for unhosted repository fixtures.
  if (owner && (owner.instance_id !== instanceId || owner.active !== 1)) {
    throw new JobError('JOB_OWNER_MISMATCH', 'Job host no longer owns this database');
  }
}
