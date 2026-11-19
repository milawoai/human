import assert from 'node:assert/strict';
import { dispatchFixture, input, tick } from './job-dispatch.fixture';
import { JobError } from '../jobs.errors';

export async function runDispatchCases() {
  const f = await dispatchFixture();
  try {
    const gate = f.gate();
    let calls = 0, aborts = 0;
    f.registry.register('pi-readonly', { async execute(spec, context) {
      calls++; assert.equal(spec.prompt, 'fixture');
      context.signal.addEventListener('abort', () => aborts++);
      await context.progress({ message: 'reading', completed: 0, total: 1 });
      await context.progress({ message: 'read complete', completed: 1, total: 1 });
      return gate.promise;
    } });
    assert.throws(() => f.registry.register('pi-readonly', { execute: async () => ({ outcome: 'cancelled' }) }), JobError);
    const before = f.service.submit('scope', input('before'));
    assert.equal(before.job.state, 'accepted'); assert.equal(calls, 0);
    const cancelled = f.service.cancel('scope', before.job.jobId);
    assert.equal(cancelled.job.state, 'cancelled'); assert.equal(cancelled.requested, true);
    await f.dispatcher.waitForIdle(); assert.equal(calls, 0, 'cancel before dispatch must never execute');
    const first = f.service.submit('scope', input('run'));
    assert.equal(f.service.submit('scope', input('run')).reused, true);
    await tick();
    assert.equal(calls, 1);
    const active = f.service.get('scope', first.job.jobId);
    assert.equal(active.state, 'running');
    assert.ok(['reading', 'read complete'].includes(active.progress?.message ?? ''), 'progress is persisted');
    assert.throws(() => f.service.cancel('other-scope', first.job.jobId), JobError);
    assert.equal(aborts, 0);
    assert.equal(f.service.cancel('scope', first.job.jobId).job.state, 'cancelling');
    assert.equal(f.service.cancel('scope', first.job.jobId).requested, false);
    assert.equal(aborts, 1);
    assert.throws(() => f.service.submit('scope', input('blocked')),
      (e: unknown) => e instanceof JobError && e.code === 'JOB_BUSY');
    gate.resolve({ outcome: 'succeeded', report: 'actual success', evidence: [] });
    await f.dispatcher.waitForIdle();
    const done = f.service.get('scope', first.job.jobId);
    assert.equal(done.state, 'succeeded', 'real success wins over cancellation intent');
    assert.equal(done.progress?.message, 'read complete', 'latest merged progress flushes before settle');
    assert.equal(f.service.result('scope', first.job.jobId).report, 'actual success');
    assert.equal(f.service.cancel('scope', first.job.jobId).requested, false);
    assert.equal(f.service.submit('scope', input('run')).reused, true);
    assert.equal(calls, 1); assert.deepEqual(f.diagnostics, []);
    const seqs = f.changed.filter(s => s.startsWith(`${done.jobId}:`)).map(s => Number(s.split(':').at(-1)));
    assert.ok(seqs.every((seq, i) => i === 0 || seq > seqs[i - 1]), 'published committed versions increase');
    console.log('PASS: prompt return, pre-dispatch cancel, single execution, progress and cancellation race');
  } finally { await f.close(); }
}
