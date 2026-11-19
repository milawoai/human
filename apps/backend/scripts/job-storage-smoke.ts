import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { JobRepository } from '../src/motor/jobs/persistence/job.repository';
import { JobError } from '../src/motor/jobs/jobs.errors';
import { raceJobAdmission } from './job-storage-race';

const input = (key = 'key') => ({ idempotencyKey: key, kind: 'pi-readonly' as const,
  spec: { prompt: 'read public fixture', cwd: '/fixture' } });
const errorCode = (code: string) => (e: unknown) => e instanceof JobError && e.code === code;

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'human-job-storage-'));
  const database = join(directory, 'motor.db');
  const connections: DataSource[] = [];
  const connect = async () => {
    const source = new DataSource({ type: 'better-sqlite3', database, synchronize: false });
    await source.initialize(); connections.push(source); return source;
  };
  try {
    const source = await connect();
    await source.query('CREATE TABLE existing_fixture (value TEXT)');
    await source.query("INSERT INTO existing_fixture VALUES ('preserved')");
    const jobs = new JobRepository(source, 'owner-a');
    jobs.initialize(); jobs.initialize();
    const first = jobs.submit('scope-a', input(), 10);
    assert.equal(first.reused, false);
    assert.equal(first.job.state, 'accepted');
    assert.equal(first.job.seq, 1);
    assert.deepEqual(jobs.submit('scope-a', input(), 11), { ...first, reused: true });
    assert.throws(() => jobs.submit('scope-a', { ...input(), spec: { ...input().spec, prompt: 'different' } }, 12),
      errorCode('JOB_IDEMPOTENCY_CONFLICT'));
    assert.throws(() => jobs.submit('scope-b', input(), 12), errorCode('JOB_BUSY'));
    assert.equal((await source.query('SELECT count(*) AS n FROM motor_jobs'))[0].n, 1);
    assert.throws(() => jobs.get('scope-b', first.job.jobId), errorCode('JOB_NOT_FOUND'));
    assert.throws(() => jobs.result('scope-a', first.job.jobId), errorCode('JOB_RESULT_NOT_READY'));
    const other = new JobRepository(await connect(), 'owner-b'); other.initialize();
    assert.throws(() => other.submit('scope-b', input(), 12), errorCode('JOB_BUSY'));
    assert.throws(() => other.transition('scope-a', first.job.jobId, 1, { type: 'dispatch' }, 20), errorCode('JOB_OWNER_MISMATCH'));
    const running = jobs.transition('scope-a', first.job.jobId, 1, { type: 'dispatch' }, 20);
    assert.equal(running.seq, 2);
    assert.throws(() => jobs.transition('scope-a', first.job.jobId, 1, { type: 'cancel' }, 21), errorCode('JOB_STALE_VERSION'));
    const cancelling = jobs.transition('scope-a', first.job.jobId, 2, { type: 'cancel' }, 22);
    assert.equal(cancelling.state, 'cancelling');
    assert.throws(() => other.submit('scope-b', input(), 23), errorCode('JOB_BUSY'));
    assert.equal(jobs.transition('scope-a', first.job.jobId, 3, { type: 'cancel' }, 24).seq, 3);

    // Force a database write failure after the result insert: the entire transaction must roll back.
    await source.query(`CREATE TRIGGER fixture_fail BEFORE UPDATE ON motor_jobs
      WHEN NEW.state = 'succeeded' BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END`);
    const complete = () => jobs.settle('scope-a', first.job.jobId, 3,
      { outcome: 'succeeded', report: 'read complete', evidence: [{ path: 'README.md' }] }, 30);
    assert.throws(complete, /fixture write failure/);
    assert.equal(jobs.get('scope-a', first.job.jobId).state, 'cancelling');
    assert.equal((await source.query('SELECT count(*) AS n FROM motor_job_results'))[0].n, 0);
    await source.query('DROP TRIGGER fixture_fail');
    const done = complete();
    assert.equal(done.state, 'succeeded', 'success is not overwritten by cancellation intent');
    assert.equal(done.seq, 4);
    assert.equal(jobs.result('scope-a', done.jobId).report, 'read complete');
    assert.throws(complete, errorCode('JOB_STALE_VERSION'));
    const limited = new JobRepository(source, 'owner-a', 1);
    assert.throws(() => limited.submit('scope-a', input(), 31), errorCode('JOB_SCHEMA_INCOMPATIBLE'),
      'each repository instance must validate the schema before use');
    limited.initialize();
    assert.equal(limited.submit('scope-a', input(), 31).reused, true, 'replay survives retention capacity');
    assert.throws(() => limited.submit('scope-a', input('new'), 31), errorCode('JOB_CAPACITY'));
    await source.query(`CREATE TRIGGER fixture_reject BEFORE INSERT ON motor_jobs
      BEGIN SELECT RAISE(ABORT, 'fixture insert failure'); END`);
    assert.throws(() => other.submit('scope-b', input(), 39), /fixture insert failure/);
    assert.equal((await source.query('SELECT count(*) AS n FROM motor_jobs'))[0].n, 1);
    await source.query('DROP TRIGGER fixture_reject');
    const second = other.submit('scope-b', input(), 40);
    assert.notEqual(second.job.jobId, first.job.jobId, 'same key in a different scope creates an independent job');
    other.transition('scope-b', second.job.jobId, 1, { type: 'cancel' }, 41);
    assert.equal((await source.query('SELECT value FROM existing_fixture'))[0].value, 'preserved');
    await Promise.all(connections.map(s => s.destroy())); connections.length = 0;
    const reopened = new JobRepository(await connect(), 'owner-c'); reopened.initialize();
    assert.equal(reopened.get('scope-a', done.jobId).state, 'succeeded');
    assert.equal(reopened.result('scope-a', done.jobId).evidence[0].path, 'README.md');
    assert.equal(reopened.submit('scope-a', input(), 50).reused, true);
    console.log('PASS: SQLite persistence, scope, global slot, CAS, cancellation and atomic result rollback');

    const sameKey = await raceJobAdmission(database, ['same-key', 'same-key']);
    assert.ok(sameKey.every(r => r.job), JSON.stringify(sameKey));
    assert.equal(sameKey[0].job!.jobId, sameKey[1].job!.jobId);
    assert.equal(sameKey.filter(r => r.reused === false).length, 1);
    const winner = sameKey.find(r => r.reused === false)!;
    const owner = new JobRepository(connections[0], winner.owner); owner.initialize();
    owner.transition('race-scope', winner.job!.jobId, 1, { type: 'cancel' }, 101);
    const differentKeys = await raceJobAdmission(database, ['different-a', 'different-b']);
    assert.equal(differentKeys.filter(r => r.job && !r.reused).length, 1);
    assert.equal(differentKeys.filter(r => r.code === 'JOB_BUSY').length, 1, JSON.stringify(differentKeys));
    assert.equal((await connections[0].query('SELECT count(*) AS n FROM motor_jobs'))[0].n, 4,
      'the busy loser must not leave an accepted row');
    console.log('PASS: separate-process concurrent replay and single-slot competition');

    const schemaSource = connections[0];
    await schemaSource.query('UPDATE motor_job_schema SET version = 999');
    assert.throws(() => reopened.initialize(), errorCode('JOB_SCHEMA_INCOMPATIBLE'));
    assert.equal((await schemaSource.query('SELECT count(*) AS n FROM motor_jobs'))[0].n, 4);
    await schemaSource.query('UPDATE motor_job_schema SET version = 1');
    await schemaSource.query('DROP INDEX motor_jobs_active_slot');
    assert.throws(() => reopened.initialize(), errorCode('JOB_SCHEMA_INCOMPATIBLE'));
    console.log('PASS: unsupported schema fails closed without deleting stored jobs');
    console.log('Job storage: ALL GROUPS PASS (temporary SQLite only; no host ownership or Pi)');
  } finally {
    await Promise.all(connections.filter(s => s.isInitialized).map(s => s.destroy()));
    rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
