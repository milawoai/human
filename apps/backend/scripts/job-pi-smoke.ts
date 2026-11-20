import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiWorkspaceExecutor } from '../src/brain/agent/worker/pi-workspace-executor';
import { JobWorkspaceGrants } from '../src/motor/jobs/core/workspace-grants';
import { fixtureJobLlm } from './job-pi-fixture';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';
import { ProviderAuthService } from '../src/brain/language-center/provider-auth.service';
import { LlmService } from '../src/brain/language-center/llm.service';
import { verifyWorkerRegistrationDoesNotDependOnModuleOrder } from '../src/brain/agent/worker/tests/bootstrap.cases';

async function main() {
  verifyWorkerRegistrationDoesNotDependOnModuleOrder();
  console.log('Job bootstrap: PASS worker registration is independent of Nest module init order');
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'human-job-pi-')));
  const root = join(directory, 'workspace'); mkdirSync(root);
  writeFileSync(join(root, 'public.txt'), 'Public workspace fixture. No secrets.\n');
  try {
    const grantsPath = join(directory, 'job-workspaces.json');
    writeFileSync(grantsPath, JSON.stringify({ version: 1, defaultWorkspaceId: 'fixture-workspace',
      workspaces: [{ id: 'fixture-workspace', path: root, label: 'Fixture' }] }));
    const grants = new JobWorkspaceGrants(grantsPath), llm = await fixtureJobLlm();
    const auth = { resolveApiKey: async () => undefined };
    const worker = new PiWorkspaceExecutor(grants, llm, auth);
    const context = () => ({ jobId: 'fixture', signal: new AbortController().signal, progress: async () => {} });
    const spec = { prompt: 'Read public.txt and report.', workspaceId: 'fixture-workspace', cwd: '.' };
    const outcome = await worker.execute(spec, context());
    assert.equal(outcome.outcome, 'succeeded', JSON.stringify(outcome));
    assert.equal(outcome.evidence?.[0].path, 'public.txt'); assert.equal(llm.requests(), 2);
    const cancel = new AbortController();
    const waiting = await fixtureJobLlm(() => setImmediate(() => cancel.abort()));
    const cancelled = await new PiWorkspaceExecutor(grants, waiting, auth).execute({ ...spec, prompt: 'WAIT_FOR_CANCEL' },
      { ...context(), signal: cancel.signal });
    assert.equal(cancelled.outcome, 'cancelled');
    let resolve!: (value: typeof llm.model) => void;
    const initializing = { ...llm, resolveModel: () => new Promise<typeof llm.model>(r => { resolve = r; }) };
    const earlyCancel = new AbortController();
    const early = new PiWorkspaceExecutor(grants, initializing, auth).execute(spec,
      { ...context(), signal: earlyCancel.signal });
    await new Promise<void>(r => setImmediate(r)); earlyCancel.abort(); resolve(llm.model);
    assert.equal((await early).outcome, 'cancelled'); assert.equal(llm.requests(), 2, 'initialization cancellation must not prompt');
    console.log('Job Pi SDK: PASS actual Agent loop + fixture stream, real read/evidence, cancellation and startup cancellation');
    if (process.env.HUMAN_JOB_REAL_PI === '1') {
      const config = new ModelConfigService(), realAuth = new ProviderAuthService();
      const real = new PiWorkspaceExecutor(grants, new LlmService(config, realAuth), realAuth);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const started = Date.now();
        const result = await real.execute({ ...spec,
          prompt: 'Use read to read public.txt. Then summarize its contents in one short sentence.',
          profileName: process.env.HUMAN_JOB_PROFILE }, { ...context(), signal: controller.signal });
        assert.equal(result.outcome, 'succeeded', JSON.stringify(result));
        assert.ok(result.evidence?.some(e => e.path === 'public.txt'));
        console.log(`Job REAL Pi: PASS ${Date.now() - started}ms; evidence=${result.evidence!.length}; reportBytes=${Buffer.byteLength(result.report!)}`);
      } finally { clearTimeout(timer); }
    } else console.log('Job REAL Pi: NOT RUN (explicit HUMAN_JOB_REAL_PI=1 required)');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
