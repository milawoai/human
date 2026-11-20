import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { JobOwner, probeJobProcess } from '../src/motor/jobs/core/job-owner';
import { JobRepository } from '../src/motor/jobs/persistence/job.repository';
import { JobError } from '../src/motor/jobs/jobs.errors';
import { legacyJobSchema } from '../src/motor/jobs/persistence/job-schema';

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'human-job-owner-'));
  const source = new DataSource({ type: 'better-sqlite3', database: join(directory, 'motor.db') });
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const spawned = once(child, 'spawn');
  try {
    await source.initialize(); await spawned;
    for (const sql of Object.values(legacyJobSchema)) await source.query(sql);
    await source.query('INSERT INTO motor_job_schema VALUES (1, 1)');
    await source.query(`INSERT INTO motor_jobs
      (job_id, scope_key, idempotency_key, spec_hash, spec_json, state, seq, owner_instance_id, created_at, finished_at, result_ref)
      VALUES ('historical', 's', 'historical', 'hash', '{}', 'succeeded', 3, 'old', 1, 2, 'result')`);
    await source.query("INSERT INTO motor_job_results VALUES ('result', 'historical', 'historical report', '[]', 2)");
    const old = new JobRepository(source, 'old');
    old.initialize();
    assert.equal((await source.query('SELECT version FROM motor_job_schema'))[0].version, 3);
    assert.equal(old.get('s', 'historical').state, 'succeeded');
    assert.equal((await source.query('SELECT report FROM motor_job_results'))[0].report, 'historical report');
    const identity = { instanceId: 'old', deploymentId: 'fixture', pid: child.pid!, startedAt: 'fixture' };
    const owner = new JobOwner(source, identity); owner.acquire();
    assert.equal(probeJobProcess(process.pid), 'alive');
    const submitted = old.submit('s', { idempotencyKey: 'old', kind: 'pi-workspace', spec: { prompt: 'read', workspaceId: 'fixture-workspace', cwd: '.' } }, 10);
    old.transition('s', submitted.job.jobId, 1, { type: 'dispatch' }, 11);
    old.transition('s', submitted.job.jobId, 2, { type: 'cancel' }, 12);
    const nextIdentity = { ...identity, instanceId: 'next', pid: process.pid };
    const next = new JobOwner(source, nextIdentity);
    const reusedIdentity = new JobOwner(source, { ...nextIdentity, instanceId: 'old' });
    assert.throws(() => reusedIdentity.acquire(), (e: unknown) => e instanceof JobError && e.code === 'JOB_HOST_BUSY',
      'a reused instanceId must not bypass the live process guard');
    assert.throws(() => next.acquire(), (e: unknown) => e instanceof JobError && e.code === 'JOB_HOST_BUSY');
    const unsure = new JobOwner(source, nextIdentity, () => 'unknown');
    assert.throws(() => unsure.acquire(), (e: unknown) => e instanceof JobError && e.code === 'JOB_HOST_BUSY');
    child.kill('SIGKILL'); await once(child, 'exit');
    assert.equal(probeJobProcess(identity.pid), 'dead');
    const recovered = next.acquire();
    assert.equal(recovered.length, 1); assert.equal(recovered[0].state, 'unknown');
    const jobs = new JobRepository(source, 'next'); jobs.initialize();
    assert.equal(jobs.get('s', submitted.job.jobId).state, 'unknown');
    assert.equal(jobs.get('s', submitted.job.jobId).seq, 4);
    assert.equal(jobs.submit('s', { idempotencyKey: 'old', kind: 'pi-workspace', spec: { prompt: 'read', workspaceId: 'fixture-workspace', cwd: '.' } }, 20).reused, true);
    assert.throws(() => old.transition('s', submitted.job.jobId, 4, { type: 'cancel' }, Date.now()), JobError);
    const newJob = jobs.submit('s', { idempotencyKey: 'new', kind: 'pi-workspace', spec: { prompt: 'read', workspaceId: 'fixture-workspace', cwd: '.' } }, Date.now());
    next.markUncertain('shutdown wait expired'); next.release();
    assert.equal(jobs.get('s', newJob.job.jobId).state, 'unknown');
    assert.throws(() => jobs.submit('s', { idempotencyKey: 'other', kind: 'pi-workspace', spec: { prompt: 'read', workspaceId: 'fixture-workspace', cwd: '.' } }, Date.now()), JobError);
    console.log('Job owner: PASS live/uncertain host rejection, killed host recovery, stale owner fencing and shutdown uncertainty');
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
    if (source.isInitialized) await source.destroy();
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
