import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobWorkspaceGrants } from '../core/workspace-grants';
import { JobError } from '../jobs.errors';

const directory = mkdtempSync(join(tmpdir(), 'human-job-grants-'));
try {
  const first = join(directory, 'first');
  const second = join(directory, 'second');
  mkdirSync(first); mkdirSync(second);
  const firstPath = realpathSync(first), secondPath = realpathSync(second);
  const configPath = join(directory, 'grants.json');
  const save = (value: unknown) => writeFileSync(configPath, JSON.stringify(value));
  save({ version: 1, defaultWorkspaceId: 'first', workspaces: [
    { id: 'first', path: firstPath, label: 'First folder' }, { id: 'second', path: secondPath },
  ] });
  const grants = new JobWorkspaceGrants(configPath);
  const resolveSelected = grants.resolve.bind(grants) as (id?: string, workspacePath?: string) => { id: string; root: string };
  assert.equal(grants.resolve().root, firstPath, 'missing workspaceId resolves only to the explicitly selected default');
  assert.equal(grants.resolve('second').root, secondPath, 'a per-job grant can select another authorized directory');
  assert.equal(resolveSelected(undefined, firstPath).root, firstPath, 'an authorized workspace path can select that grant');
  assert.equal(resolveSelected('first', secondPath).root, secondPath, 'an explicit path takes precedence over a conflicting ID');
  assert.throws(() => resolveSelected(undefined, directory), (error: unknown) => error instanceof JobError && error.code === 'JOB_WORKSPACE_DENIED');
  assert.throws(() => grants.resolve('unlisted'), (error: unknown) => error instanceof JobError && error.code === 'JOB_WORKSPACE_DENIED');
  save({ version: 1, defaultWorkspaceId: 'removed', workspaces: [{ id: 'first', path: firstPath }] });
  assert.throws(() => grants.resolve(), (error: unknown) => error instanceof JobError && error.code === 'JOB_WORKSPACE_DENIED');
  save({ version: 1, defaultWorkspaceId: 'first', workspaces: [{ id: 'first', path: directory }, { id: 'first', path: firstPath }] });
  assert.throws(() => grants.resolve(), (error: unknown) => error instanceof JobError && error.code === 'JOB_WORKSPACE_DENIED');
  save({ version: 1, defaultWorkspaceId: null, workspaces: [{ id: 'second', path: secondPath }] });
  assert.throws(() => grants.resolve('second'), (error: unknown) => error instanceof JobError && error.code === 'JOB_WORKSPACE_DENIED');
  save({ version: 1, defaultWorkspaceId: 'first', workspaces: [
    { id: 'first', path: firstPath }, { id: 'second', path: firstPath },
  ] });
  assert.throws(() => grants.resolve('first'), (error: unknown) => error instanceof JobError && error.code === 'JOB_WORKSPACE_DENIED');
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log('PASS: explicit Job workspace catalog, default grant, per-job selection, revocation and malformed catalog');
