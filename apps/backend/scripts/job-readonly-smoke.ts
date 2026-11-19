import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { WorkspacePolicy } from '../src/brain/agent/worker/workspace-policy';
import { createReadonlyJobTools } from '../src/brain/agent/worker/readonly-tools';

async function main() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'human-job-readonly-')));
  try {
    writeFileSync(join(directory, 'public.txt'), 'public fixture\nsecond line\n');
    writeFileSync(join(directory, 'large.txt'), 'x'.repeat(256 * 1024 + 1));
    symlinkSync('/etc/passwd', join(directory, 'outside-link'));
    symlinkSync(directory, join(directory, 'inside-link'));
    if (process.platform !== 'win32') execFileSync('mkfifo', [join(directory, 'pipe')]);
    const policy = new WorkspacePolicy(directory);
    assert.equal(policy.authorizeCwd(directory), directory);
    assert.throws(() => policy.authorizeCwd('/'));
    assert.throws(() => policy.read(directory, '../outside'));
    assert.throws(() => policy.read(directory, '/etc/passwd'));
    assert.throws(() => policy.read(directory, 'outside-link'));
    assert.throws(() => policy.read(directory, 'inside-link/public.txt'));
    if (process.platform !== 'win32') assert.throws(() => policy.read(directory, 'pipe'), 'special files must be refused without blocking');
    assert.throws(() => policy.read(directory, 'large.txt'));
    assert.throws(() => policy.read(directory, 'public.txt', 4), 'remaining byte budget is enforced before content is read');
    const text = policy.read(directory, 'public.txt');
    assert.equal(text.text, 'public fixture\nsecond line\n');
    assert.equal(text.evidence.path, 'public.txt'); assert.ok(text.evidence.contentHash);
    const controller = new AbortController();
    const worker = createReadonlyJobTools(policy, directory, controller.signal);
    assert.deepEqual(worker.tools.map(t => t.name), ['read', 'ls']);
    const invoke = (name: string, args: unknown) => worker.tools.find(t => t.name === name)!.execute('fixture', args as never, controller.signal);
    await invoke('read', { path: 'public.txt' });
    assert.equal(worker.evidence.length, 1);
    assert.throws(() => policy.list(directory, 'outside-link'));
    for (let i = 1; i < 20; i++) await invoke('ls', { path: '.' });
    await assert.rejects(async () => invoke('ls', { path: '.' }), /budget/i);
    controller.abort();
    await assert.rejects(async () => invoke('read', { path: 'public.txt' }));
    assert.equal(readFileSync(join(directory, 'public.txt'), 'utf8'), text.text);
    console.log('Job readonly: PASS workspace boundary, symlinks, text limit, IO evidence, allowlist, budget and abort');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
