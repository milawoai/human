import assert from 'node:assert/strict';
import { dispatchFixture, input } from './job-dispatch.fixture';
import type { JobProgress } from '../jobs.types';

export async function runDispatchBoundaryCases() {
  const f = await dispatchFixture(300_000, job => {
    job.state = 'unknown'; // observers receive a copy, never the authoritative snapshot
    throw new Error('fixture notification failure');
  });
  try {
    const missing = f.service.submit('s', input('missing'));
    await f.dispatcher.waitForIdle();
    assert.equal(f.service.get('s', missing.job.jobId).state, 'failed', 'missing executor must not leave accepted forever');
    let lateProgress!: (progress: JobProgress) => Promise<void>;
    f.registry.register('pi-workspace', { async execute(spec, context) {
      lateProgress = context.progress;
      if (spec.prompt === 'bad-progress') await context.progress({ message: 'bad', completed: -1 });
      return { outcome: 'succeeded', report: 'actual output' };
    } });
    const success = f.service.submit('s', input('success'));
    await f.dispatcher.waitForIdle();
    const done = f.service.get('s', success.job.jobId);
    assert.equal(done.state, 'succeeded', 'publication errors cannot rewrite execution success');
    await lateProgress({ message: 'late callback' });
    assert.equal(f.service.get('s', done.jobId).seq, done.seq, 'late progress does not mutate terminal jobs');
    assert.ok(f.diagnostics.length > 0);
    const bad = f.service.submit('s', { ...input('bad'), spec: { ...input('bad').spec, prompt: 'bad-progress' } });
    await f.dispatcher.waitForIdle();
    assert.equal(f.service.get('s', bad.job.jobId).state, 'failed');
    assert.equal(f.service.get('s', bad.job.jobId).progress, undefined);
    console.log('PASS: missing executor, invalid progress, notification isolation and late callbacks');
  } finally { await f.close(); }
}
