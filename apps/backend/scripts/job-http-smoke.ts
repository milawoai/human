import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { io } from 'socket.io-client';
import { jobHttpFixture, pollJob } from './job-http-fixture';
import { JobsHostService } from '../src/motor/jobs/core/jobs-host.service';

async function main() {
  const f = await jobHttpFixture();
  const socket = io(`${f.baseUrl}/neural`, { transports: ['websocket'], autoConnect: false });
  const events: Array<{ topic: string; payload: { jobId: string; state: string; seq: number } }> = [];
  const wait = (name: string) => new Promise<void>((resolve, reject) => {
    const ready = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { socket.off(name, ready); reject(new Error(`WS ${name} timeout`)); }, 3000);
    socket.once(name, ready);
  });
  try {
    socket.on('message', message => events.push(message));
    const connected = wait('connect'); socket.connect(); await connected;
    const registered = wait('registered');
    socket.emit('register', { protocolVersion: 1, serviceInstanceId: 'job-test-client',
      actor: { actorId: 'job-test-client', runtime: 'electron', system: 'body' } }); await registered;
    const subscribed = wait('subscribed'); socket.emit('subscribe', { topics: ['motor.job.*'], kinds: ['event'] }); await subscribed;
    const submit = (key: string, prompt = 'Read public.txt and report.', selector: { workspaceId?: string; workspace?: string } = {}) => f.trigger('motor.job.submit', {
      idempotencyKey: key, kind: 'pi-workspace', spec: { cwd: '.', prompt, ...selector },
    });
    const first = await submit('http-1'); assert.equal(first.success, true, JSON.stringify(first));
    assert.equal(first.data.state, 'accepted'); assert.equal(first.data.seq, 1);
    const done = await pollJob(f, first.data.jobId, state => ['succeeded', 'failed'].includes(state));
    assert.equal(done.state, 'succeeded', JSON.stringify(done));
    const result = await f.trigger('motor.job.result', { jobId: done.jobId });
    assert.equal(result.success, true); assert.equal(result.data.evidence[0].path, 'public.txt');
    const alternate = await submit('alternate-workspace', 'ALTERNATE workspace', {
      workspaceId: 'fixture-workspace', workspace: f.alternateWorkspace,
    });
    assert.equal(alternate.success, true, JSON.stringify(alternate));
    const alternateDone = await pollJob(f, alternate.data.jobId, state => ['succeeded', 'failed'].includes(state));
    assert.equal(alternateDone.state, 'succeeded', JSON.stringify(alternateDone));
    const alternateResult = await f.trigger('motor.job.result', { jobId: alternateDone.jobId });
    assert.ok(alternateResult.data.evidence.some((item: { path: string }) => item.path === 'alternate-only.txt'),
      'explicit authorized path takes precedence over workspaceId and routes IO into that grant');
    const alternateReplay = await submit('alternate-workspace', 'ALTERNATE workspace', { workspaceId: 'alternate-workspace' });
    assert.equal(alternateReplay.data.jobId, alternate.data.jobId, 'path and grant ID for the same directory share idempotency identity');
    assert.equal(alternateReplay.data.reused, true);
    assert.equal((await submit('http-1')).data.reused, true); assert.equal(f.requests(), 4);
    assert.equal((await submit('http-1', 'changed')).code, 'JOB_IDEMPOTENCY_CONFLICT');
    assert.equal((await f.trigger('motor.job.get', { jobId: 'missing' })).code, 'JOB_NOT_FOUND');
    assert.equal((await f.trigger('motor.job.get', { jobId: done.jobId, scopeKey: 'spoof' })).code, 'JOB_INVALID_INPUT');
    assert.equal((await f.trigger('motor.job.submit', {}, 'query')).success, false, 'wrong message kind must not fake a delivery acknowledgement');
    assert.equal((await f.trigger('motor.job.submit', { idempotencyKey: 'unknown-workspace', kind: 'pi-workspace',
      spec: { workspaceId: 'not-authorized', cwd: '.', prompt: 'read' } })).code, 'JOB_WORKSPACE_DENIED');
    assert.equal((await f.trigger('motor.job.submit', { idempotencyKey: 'unapproved-path', kind: 'pi-workspace',
      spec: { workspace: f.directory, cwd: '.', prompt: 'read' } })).code, 'JOB_WORKSPACE_DENIED');
    const waiting = await submit('wait', 'WAIT_FOR_CANCEL');
    await pollJob(f, waiting.data.jobId, state => state === 'running');
    assert.equal((await submit('busy')).code, 'JOB_BUSY');
    const foreground = await f.trigger('brain.agent.run', { sessionId: 'front-job-test', userText: 'FRONTEND_PING', toolPreset: 'none' });
    assert.equal(foreground.success, true, JSON.stringify(foreground));
    assert.equal(foreground.data.runStatus, 'succeeded');
    assert.equal((await f.trigger('motor.job.get', { jobId: waiting.data.jobId })).data.state, 'running', 'foreground does not consume or settle the Job slot');
    const cancel = await f.trigger('motor.job.cancel', { jobId: waiting.data.jobId });
    assert.equal(cancel.data.job.state, 'cancelling');
    const cancelled = await pollJob(f, waiting.data.jobId, state => state === 'cancelled');
    await new Promise(resolve => setTimeout(resolve, 20));
    const settled = events.filter(e => e.topic === 'motor.job.settled');
    assert.ok(settled.some(e => e.payload.jobId === done.jobId && e.payload.seq === done.seq));
    assert.ok(settled.some(e => e.payload.jobId === cancelled.jobId && e.payload.seq === cancelled.seq));
    const versions = events.filter(e => e.topic === 'motor.job.changed' && e.payload.jobId === done.jobId).map(e => e.payload.seq);
    assert.ok(versions.length >= 3 && versions.every((seq, i) => !i || seq > versions[i - 1]));
    console.log('Job HTTP/WS: PASS actual Nest/Neural + Pi SDK, submit/get/result/cancel, replay, busy, path guard and sequenced events');
    const submitTimes: number[] = [], getTimes: number[] = [];
    for (let i = 0; i < 100; i++) {
      let start = performance.now();
      const accepted = await submit(`latency-${i}`); submitTimes.push(performance.now() - start);
      assert.equal(accepted.success, true);
      start = performance.now();
      assert.equal((await f.trigger('motor.job.get', { jobId: accepted.data.jobId })).success, true);
      getTimes.push(performance.now() - start);
      const finished = await pollJob(f, accepted.data.jobId, state => ['succeeded', 'failed'].includes(state));
      assert.equal(finished.state, 'succeeded');
    }
    const p95 = (values: number[]) => values.sort((a, b) => a - b)[94];
    assert.ok(p95(submitTimes) <= 200); assert.ok(p95(getTimes) <= 200);
    console.log(`Job HTTP latency: PASS newSubmitP95=${p95(submitTimes).toFixed(1)}ms; getP95=${p95(getTimes).toFixed(1)}ms; n=100`);
    const beforeUnsettled = f.requests();
    const unsettled = await submit('shutdown', 'UNCOOPERATIVE_WAIT');
    await pollJob(f, unsettled.data.jobId, state => state === 'running');
    // Let the real SDK enter the uncooperative fixture stream before shutdown.
    const requestDeadline = Date.now() + 2000;
    while (f.requests() === beforeUnsettled && Date.now() < requestDeadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(f.requests() > beforeUnsettled);
    await f.app.get(JobsHostService).beforeApplicationShutdown();
    const uncertain = (await f.source.query('SELECT state FROM motor_jobs WHERE job_id = ?', [unsettled.data.jobId]))[0];
    assert.equal(uncertain.state, 'unknown', 'shutdown timeout cannot pretend execution was cancelled');
    assert.equal((await submit('after-shutdown')).code, 'JOB_NOT_READY');
    f.release(); await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal((await f.source.query('SELECT state FROM motor_jobs WHERE job_id = ?', [unsettled.data.jobId]))[0].state, 'unknown');
    assert.ok(!events.some(e => e.topic === 'motor.job.settled' && e.payload.jobId === unsettled.data.jobId));
    console.log('Job shutdown: PASS bounded wait, unknown, closed admission and late-callback fencing');
  } finally { socket.disconnect(); await f.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
