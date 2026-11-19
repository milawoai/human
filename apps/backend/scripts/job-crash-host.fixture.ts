import { jobHttpFixture, pollJob } from './job-http-fixture';

async function main() {
  const f = await jobHttpFixture();
  process.send!({ type: 'directory', directory: f.directory });
  process.once('disconnect', () => { void f.close().catch(() => { process.exitCode = 1; }); });
  const accepted = await f.trigger('motor.job.submit', { idempotencyKey: 'crash', kind: 'pi-readonly',
    spec: { cwd: f.workspace, prompt: 'WAIT_FOR_CANCEL' } });
  if (!accepted.success) throw new Error(JSON.stringify(accepted));
  await pollJob(f, accepted.data.jobId, state => state === 'running');
  const deadline = Date.now() + 2000;
  while (!f.requests() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  if (!f.requests()) throw new Error('Fixture model did not start');
  process.send!({ type: 'ready', jobId: accepted.data.jobId, workspace: f.workspace });
}
main().catch(error => { console.error(error); process.exit(1); });
