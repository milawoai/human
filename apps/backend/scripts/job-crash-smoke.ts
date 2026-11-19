import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { jobHttpFixture, pollJob } from './job-http-fixture';

async function main() {
  const child = fork(join(__dirname, 'job-crash-host.fixture.ts'), [], {
    execArgv: ['-r', require.resolve('ts-node/register'), '-r', require.resolve('tsconfig-paths/register')],
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  let directory: string | undefined;
  let f: Awaited<ReturnType<typeof jobHttpFixture>> | undefined;
  try {
    const jobId = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Crash fixture startup timeout')), 15000);
      const exited = () => { clearTimeout(timer); reject(new Error('Host exited before starting its Job')); };
      child.once('error', reject); child.once('exit', exited);
      child.on('message', (message: { type: string; directory?: string; jobId?: string }) => {
        if (message.type === 'directory') directory = message.directory;
        if (message.type === 'ready') { clearTimeout(timer); child.off('exit', exited); resolve(message.jobId!); }
      });
    });
    child.kill('SIGKILL'); await once(child, 'exit');
    assert.ok(directory);
    f = await jobHttpFixture(false, directory);
    const old = await f.trigger('motor.job.get', { jobId });
    assert.equal(old.success, true, JSON.stringify(old)); assert.equal(old.data.state, 'unknown');
    assert.ok(old.data.seq > 1);
    const replay = await f.trigger('motor.job.submit', { idempotencyKey: 'crash', kind: 'pi-readonly',
      spec: { cwd: f.workspace, prompt: 'WAIT_FOR_CANCEL' } });
    assert.equal(replay.data.jobId, jobId); assert.equal(replay.data.reused, true);
    assert.equal(replay.data.state, 'unknown'); assert.equal(f.requests(), 0, 'recovery must not rerun old model work');
    const next = await f.trigger('motor.job.submit', { idempotencyKey: 'after-crash', kind: 'pi-readonly',
      spec: { cwd: f.workspace, prompt: 'Read public.txt' } });
    assert.equal(next.success, true);
    assert.equal((await pollJob(f, next.data.jobId, state => ['succeeded', 'failed'].includes(state))).state, 'succeeded');
    console.log('Job CRASH HTTP: PASS real Node host killed during Pi SDK execution; restart unknown, replay without model call, new execution succeeds');
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
    if (f) await f.close(); else if (directory) rmSync(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
