import type { DataSource } from 'typeorm';
import { JobError } from '../jobs.errors';
import { jobDatabase, jobTransaction } from '../persistence/job-database';
import { readJobOwner, assertJobOwner } from '../persistence/job-owner-row';
import { jobSnapshot, type JobRow } from '../persistence/job-row';
import type { JobSnapshot } from '../jobs.types';

export interface JobHostIdentity { instanceId: string; deploymentId: string; pid: number; startedAt: string }
export type JobProcessStatus = 'alive' | 'dead' | 'unknown';
export function probeJobProcess(pid: number): JobProcessStatus {
  if (!Number.isSafeInteger(pid) || pid < 1) return 'unknown';
  try { process.kill(pid, 0); return 'alive'; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'; }
}

export class JobOwner {
  private readonly db;
  constructor(source: DataSource, private readonly identity: JobHostIdentity,
    private readonly probe = probeJobProcess) { this.db = jobDatabase(source); }

  acquire(): JobSnapshot[] {
    return jobTransaction(this.db, () => {
      const previous = readJobOwner(this.db);
      const rows = this.db.prepare("SELECT * FROM motor_jobs WHERE state IN ('accepted','running','awaiting_approval','cancelling')").all() as JobRow[];
      if (previous?.instance_id === this.identity.instanceId && previous.pid === this.identity.pid
        && previous.started_at === this.identity.startedAt) {
        assertJobOwner(this.db, this.identity.instanceId); return [];
      }
      // Any live PID, including a recycled PID, blocks takeover. Never infer death from heartbeat age.
      if ((previous && this.probe(previous.pid) !== 'dead')
        || rows.some(row => row.owner_instance_id !== previous?.instance_id)) {
        throw new JobError('JOB_HOST_BUSY', 'Previous Job host is alive or its termination cannot be established');
      }
      this.db.prepare(`INSERT INTO motor_job_runtime (singleton, instance_id, deployment_id, pid, started_at, active, updated_at)
        VALUES (1, ?, ?, ?, ?, 1, ?) ON CONFLICT(singleton) DO UPDATE SET instance_id=excluded.instance_id,
        deployment_id=excluded.deployment_id, pid=excluded.pid, started_at=excluded.started_at, active=1, updated_at=excluded.updated_at`)
        .run(this.identity.instanceId, this.identity.deploymentId, this.identity.pid, this.identity.startedAt, Date.now());
      return this.uncertain(rows, 'previous host exited; execution outcome could not be confirmed');
    });
  }

  markUncertain(reason: string): JobSnapshot[] {
    return jobTransaction(this.db, () => {
      assertJobOwner(this.db, this.identity.instanceId);
      const rows = this.db.prepare("SELECT * FROM motor_jobs WHERE owner_instance_id = ? AND state IN ('accepted','running','awaiting_approval','cancelling')")
        .all(this.identity.instanceId) as JobRow[];
      return this.uncertain(rows, reason);
    });
  }

  release(): void {
    jobTransaction(this.db, () => {
      assertJobOwner(this.db, this.identity.instanceId);
      this.db.prepare('UPDATE motor_job_runtime SET active = 0, updated_at = ? WHERE singleton = 1 AND instance_id = ?')
        .run(Date.now(), this.identity.instanceId);
    });
  }

  private uncertain(rows: JobRow[], reason: string): JobSnapshot[] {
    return rows.map(row => {
      const now = Date.now();
      const result = this.db.prepare(`UPDATE motor_jobs SET state='unknown', seq=seq+1, finished_at=?, reason=?
        WHERE job_id=? AND owner_instance_id=? AND state=? AND seq=?`)
        .run(now, reason, row.job_id, row.owner_instance_id, row.state, row.seq);
      if (result.changes !== 1) throw new JobError('JOB_STALE_VERSION', 'Recovery conflicted with an execution update');
      if (row.state === 'awaiting_approval') {
        this.db.prepare("UPDATE motor_job_approvals SET status='invalidated', decided_at=? WHERE job_id=? AND status='pending'")
          .run(now, row.job_id);
      }
      return jobSnapshot({ ...row, state: 'unknown', seq: row.seq + 1, finished_at: now, reason });
    });
  }
}
