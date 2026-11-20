import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiReadonlyExecutor } from '../src/brain/agent/worker/pi-readonly-executor';
import { WorkspacePolicy } from '../src/brain/agent/worker/workspace-policy';
import { fixtureJobLlm } from './job-pi-fixture';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';
import { ProviderAuthService } from '../src/brain/language-center/provider-auth.service';
import { LlmService } from '../src/brain/language-center/llm.service';
import { verifyWorkerRegistrationDoesNotDependOnModuleOrder } from '../src/brain/agent/worker/tests/bootstrap.cases';

async function main() {
  verifyWorkerRegistrationDoesNotDependOnModuleOrder();
  console.log('Job bootstrap: PASS worker registration is independent of Nest module init order');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'human-job-pi-')));
  writeFileSync(join(root, 'public.txt'), 'Public read-only fixture. No secrets.\n');
  try {
    const policy = new WorkspacePolicy(root), llm = await fixtureJobLlm();
    const auth = { resolveApiKey: async () => undefined };
    const worker = new PiReadonlyExecutor(policy, llm, auth);
    const context = () => ({ jobId: 'fixture', signal: new AbortController().signal, progress: async () => {} });
    const outcome = await worker.execute({ prompt: 'Read public.txt and report.', cwd: root }, context());
    assert.equal(outcome.outcome, 'succeeded', JSON.stringify(outcome));
    assert.equal(outcome.evidence?.[0].path, 'public.txt'); assert.equal(llm.requests(), 2);
    const cancel = new AbortController();
    const waiting = await fixtureJobLlm(() => setImmediate(() => cancel.abort()));
    const cancelled = await new PiReadonlyExecutor(policy, waiting, auth).execute({ prompt: 'WAIT_FOR_CANCEL', cwd: root },
      { ...context(), signal: cancel.signal });
    assert.equal(cancelled.outcome, 'cancelled');
    let resolve!: (value: typeof llm.model) => void;
    const initializing = { ...llm, resolveModel: () => new Promise<typeof llm.model>(r => { resolve = r; }) };
    const earlyCancel = new AbortController();
    const early = new PiReadonlyExecutor(policy, initializing, auth).execute({ prompt: 'Read public.txt', cwd: root },
      { ...context(), signal: earlyCancel.signal });
    await new Promise<void>(r => setImmediate(r)); earlyCancel.abort(); resolve(llm.model);
    assert.equal((await early).outcome, 'cancelled'); assert.equal(llm.requests(), 2, 'initialization cancellation must not prompt');
    console.log('Job Pi SDK: PASS actual Agent loop + fixture stream, real read/evidence, cancellation and startup cancellation');
    if (process.env.HUMAN_JOB_REAL_PI === '1') {
      const config = new ModelConfigService(), realAuth = new ProviderAuthService();
      const real = new PiReadonlyExecutor(policy, new LlmService(config, realAuth), realAuth);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const started = Date.now();
        const result = await real.execute({ prompt: 'Use read to read public.txt. Then summarize its contents in one short sentence.',
          cwd: root, profileName: process.env.HUMAN_JOB_PROFILE }, { ...context(), signal: controller.signal });
        assert.equal(result.outcome, 'succeeded', JSON.stringify(result));
        assert.ok(result.evidence?.some(e => e.path === 'public.txt'));
        console.log(`Job REAL Pi: PASS ${Date.now() - started}ms; evidence=${result.evidence!.length}; reportBytes=${Buffer.byteLength(result.report!)}`);
      } finally { clearTimeout(timer); }
    } else console.log('Job REAL Pi: NOT RUN (explicit HUMAN_JOB_REAL_PI=1 required)');
  } finally { rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
