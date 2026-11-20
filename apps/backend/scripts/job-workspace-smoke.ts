import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, linkSync, rmSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { WorkspacePolicy } from '../src/brain/agent/worker/workspace-policy';
import { createJobWorkspaceTools } from '../src/brain/agent/worker/workspace-tools';

async function main() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'human-job-readonly-')));
  const externalDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'human-job-outside-')));
  try {
    writeFileSync(join(directory, 'public.txt'), 'public fixture\nsecond line\n');
    writeFileSync(join(directory, 'large.txt'), 'x'.repeat(256 * 1024 + 1));
    symlinkSync('/etc/passwd', join(directory, 'outside-link'));
    symlinkSync(directory, join(directory, 'inside-link'));
    if (process.platform !== 'win32') {
      writeFileSync(join(externalDirectory, 'secret.txt'), 'outside secret\n');
      linkSync(join(externalDirectory, 'secret.txt'), join(directory, 'hardlink.txt'));
    }
    if (process.platform !== 'win32') execFileSync('mkfifo', [join(directory, 'pipe')]);
    const policy = new WorkspacePolicy(directory);
    assert.equal(policy.authorizeCwd('.'), directory);
    assert.throws(() => policy.authorizeCwd('../outside'));
    assert.throws(() => policy.read(directory, '../outside'));
    assert.throws(() => policy.read(directory, '/etc/passwd'));
    assert.throws(() => policy.read(directory, 'outside-link'));
    assert.throws(() => policy.read(directory, 'inside-link/public.txt'));
    if (process.platform !== 'win32') assert.throws(() => policy.read(directory, 'hardlink.txt'),
      'hard links can expose data whose original path is outside the authorized workspace');
    if (process.platform !== 'win32') assert.throws(() => policy.read(directory, 'pipe'), 'special files must be refused without blocking');
    assert.throws(() => policy.read(directory, 'large.txt'));
    assert.throws(() => policy.read(directory, 'public.txt', 4), 'remaining byte budget is enforced before content is read');
    const text = policy.read(directory, 'public.txt');
    assert.equal(text.text, 'public fixture\nsecond line\n');
    assert.equal(text.evidence.path, 'public.txt'); assert.ok(text.evidence.contentHash);
    let grantActive = true;
    const revocablePolicy = new WorkspacePolicy(directory, () => {
      if (!grantActive) throw new Error('workspace grant revoked');
    });
    assert.equal(revocablePolicy.read(directory, 'public.txt').text, text.text);
    grantActive = false;
    assert.throws(() => revocablePolicy.read(directory, 'public.txt'), /revoked/,
      'revoking a grant blocks later IO even for a running Worker');
    const controller = new AbortController();
    const worker = createJobWorkspaceTools(policy, directory, controller.signal);
    assert.deepEqual(worker.tools.map(t => t.name), ['read', 'write', 'ls']);
    const invoke = (name: string, args: unknown) => worker.tools.find(t => t.name === name)!.execute('fixture', args as never, controller.signal);
    await invoke('read', { path: 'public.txt' });
    await invoke('write', { path: 'created.txt', content: 'written by job\n' });
    assert.equal(readFileSync(join(directory, 'created.txt'), 'utf8'), 'written by job\n');
    await assert.rejects(async () => invoke('write', { path: 'created.txt', content: 'replace without approval' }));
    await invoke('write', { path: 'created.txt', content: 'updated by job\n', overwrite: true });
    assert.equal(readFileSync(join(directory, 'created.txt'), 'utf8'), 'updated by job\n');
    await assert.rejects(async () => invoke('write', { path: '../outside.txt', content: 'escape' }));
    assert.equal(worker.evidence.length, 3, 'read, create and overwrite operations record evidence');
    assert.throws(() => policy.list(directory, 'outside-link'));
    for (let i = 5; i < 20; i++) await invoke('ls', { path: '.' });
    await assert.rejects(async () => invoke('ls', { path: '.' }), /budget/i);
    controller.abort();
    await assert.rejects(async () => invoke('read', { path: 'public.txt' }));
    assert.equal(readFileSync(join(directory, 'public.txt'), 'utf8'), text.text);
    console.log('Job workspace: PASS workspace boundary, symlinks, text limit, revocation, read/write evidence, budget and abort');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(externalDirectory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
