import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { jobHttpFixture, pollJob } from './job-http-fixture';

async function main() {
  if (process.env.HUMAN_JOB_REAL_PI !== '1') throw new Error('Set HUMAN_JOB_REAL_PI=1 explicitly to allow a real model request');
  const f = await jobHttpFixture(true);
  try {
    const payload = { idempotencyKey: 'real-http', kind: 'pi-workspace', spec: { cwd: '.',
      profileName: process.env.HUMAN_JOB_PROFILE,
      prompt: 'Use read to read public.txt. Summarize its content in one short sentence with the filename.' } };
    const started = performance.now();
    const first = await f.trigger('motor.job.submit', payload);
    assert.equal(first.success, true, JSON.stringify(first));
    const submitTimes: number[] = [], getTimes: number[] = [];
    for (let i = 0; i < 100; i++) {
      let start = performance.now();
      const replay = await f.trigger('motor.job.submit', payload); submitTimes.push(performance.now() - start);
      assert.equal(replay.data.jobId, first.data.jobId); assert.equal(replay.data.reused, true);
      start = performance.now();
      assert.equal((await f.trigger('motor.job.get', { jobId: first.data.jobId })).success, true);
      getTimes.push(performance.now() - start);
    }
    const done = await pollJob(f, first.data.jobId, state => ['succeeded', 'failed', 'cancelled'].includes(state), 60_000);
    assert.equal(done.state, 'succeeded', JSON.stringify(done));
    const result = await f.trigger('motor.job.result', { jobId: done.jobId });
    assert.ok(result.data.evidence.some((e: { path: string }) => e.path === 'public.txt'));
    const p95 = (values: number[]) => values.sort((a, b) => a - b)[94];
    assert.ok(p95(submitTimes) <= 200, 'replay submit p95 exceeds 200ms');
    assert.ok(p95(getTimes) <= 200, 'get p95 exceeds 200ms');
    console.log(`Job REAL HTTP Pi: PASS ${Math.round(performance.now() - started)}ms; submitReplayP95=${p95(submitTimes).toFixed(1)}ms; getP95=${p95(getTimes).toFixed(1)}ms; evidence=${result.data.evidence.length}; reportBytes=${Buffer.byteLength(result.data.report)}`);
  } finally { await f.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
