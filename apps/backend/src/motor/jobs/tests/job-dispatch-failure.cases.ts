import assert from 'node:assert/strict';
import { dispatchFixture, input, tick, deferred } from './job-dispatch.fixture';
import { JobError } from '../jobs.errors';

export async function runDispatchFailureCases() {
  const f = await dispatchFixture(30);
  try {
    const gate = f.gate();
    const aborted = deferred<void>();
    f.registry.register('pi-workspace', { async execute(spec, { signal }) {
      if (spec.prompt === 'throw') throw new Error('fixture failure');
      signal.addEventListener('abort', () => aborted.resolve());
      return gate.promise;
    } });
    const failure = f.service.submit('s', { ...input('throw'), spec: { ...input('throw').spec, prompt: 'throw' } });
    await f.dispatcher.waitForIdle();
    assert.equal(f.service.get('s', failure.job.jobId).state, 'failed');
    const timeout = f.service.submit('s', input('timeout'));
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([aborted.promise, new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('budget cancellation did not arrive')), 1000);
      })]);
    } finally { if (watchdog) clearTimeout(watchdog); }
    assert.equal(f.service.get('s', timeout.job.jobId).state, 'cancelling');
    assert.throws(() => f.service.submit('s', input('busy')), (e: unknown) => e instanceof JobError && e.code === 'JOB_BUSY');
    gate.resolve({ outcome: 'cancelled' }); await f.dispatcher.waitForIdle();
    assert.equal(f.service.get('s', timeout.job.jobId).state, 'cancelled');
    console.log('PASS: executor failure and budget cancellation retain slot until actual settle');
  } finally { await f.close(); }

  const broken = await dispatchFixture();
  try {
    const gate = broken.gate();
    broken.registry.register('pi-workspace', { execute: () => gate.promise });
    const job = broken.service.submit('s', input('write-failure'));
    await tick();
    await broken.source.query(`CREATE TRIGGER reject_settle BEFORE UPDATE ON motor_jobs
      WHEN NEW.state = 'succeeded' BEGIN SELECT RAISE(ABORT, 'fixture settle rejected'); END`);
    gate.resolve({ outcome: 'succeeded', report: 'completed' });
    await broken.dispatcher.waitForIdle();
    assert.equal(broken.service.get('s', job.job.jobId).state, 'running', 'write failure cannot invent a terminal result');
    assert.equal(broken.diagnostics.length, 1);
    assert.throws(() => broken.service.result('s', job.job.jobId), JobError);
    assert.throws(() => broken.service.submit('s', input('blocked')), (e: unknown) => e instanceof JobError && e.code === 'JOB_BUSY');
    console.log('PASS: terminal persistence failure preserves slot and reports a diagnostic');
  } finally { await broken.close(); }
}
