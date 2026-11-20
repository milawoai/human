import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Node strip-types needs a .ts extension.
import { writeWorkspaceCatalogFile } from './catalog-file.ts'

test('workspace catalog is replaced atomically as private user configuration', () => {
  const directory = mkdtempSync(join(tmpdir(), 'human-job-catalog-'))
  try {
    const file = join(directory, 'nested', 'job-workspaces.json')
    const catalog = { version: 1 as const, defaultWorkspaceId: 'a', workspaces: [{ id: 'a', path: '/work/a', label: 'A' }] }
    writeWorkspaceCatalogFile(file, catalog)
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), catalog)
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
