import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node strip-types needs a .ts extension.
import { addWorkspace, createEmptyWorkspaceCatalog, parseWorkspaceCatalog, removeWorkspace, setDefaultWorkspace } from './jobWorkspaceCatalog.ts'

test('first granted directory becomes default and later additions preserve that choice', () => {
  const first = addWorkspace(createEmptyWorkspaceCatalog(), { id: 'a', path: '/work/a', label: 'A' })
  const second = addWorkspace(first, { id: 'b', path: '/work/b', label: 'B' })
  assert.equal(first.defaultWorkspaceId, 'a')
  assert.equal(second.defaultWorkspaceId, 'a')
  assert.deepEqual(second.workspaces.map(item => item.id), ['a', 'b'])
})

test('default can be changed and removing it selects an existing grant', () => {
  const catalog = addWorkspace(addWorkspace(createEmptyWorkspaceCatalog(), { id: 'a', path: '/work/a', label: 'A' }),
    { id: 'b', path: '/work/b', label: 'B' })
  assert.equal(setDefaultWorkspace(catalog, 'b').defaultWorkspaceId, 'b')
  const removed = removeWorkspace(catalog, 'a')
  assert.equal(removed.defaultWorkspaceId, 'b')
  assert.deepEqual(removed.workspaces.map(item => item.id), ['b'])
  assert.throws(() => setDefaultWorkspace(catalog, 'missing'), /not authorized/)
})

test('duplicate canonical paths do not create duplicate grants', () => {
  const catalog = addWorkspace(createEmptyWorkspaceCatalog(), { id: 'a', path: '/work/a', label: 'A' })
  assert.equal(addWorkspace(catalog, { id: 'b', path: '/work/a', label: 'Alias' }), catalog)
})

test('malformed or inconsistent persisted catalogs are rejected fail-closed', () => {
  const invalid = [
    null,
    { version: 2, defaultWorkspaceId: null, workspaces: [] },
    { version: 1, defaultWorkspaceId: 'missing', workspaces: [{ id: 'a', path: '/work/a', label: 'A' }] },
    { version: 1, defaultWorkspaceId: null, workspaces: [
      { id: 'a', path: '/work/a', label: 'A' }, { id: 'a', path: '/work/b', label: 'B' },
    ] },
    { version: 1, defaultWorkspaceId: null, workspaces: [{ id: 'a', path: 'relative/path', label: 'A' }] },
  ]
  for (const value of invalid) assert.throws(() => parseWorkspaceCatalog(value))
})

test('directory catalog has a bounded grant count', () => {
  const catalog = { version: 1 as const, defaultWorkspaceId: 'g-0', workspaces: Array.from({ length: 100 }, (_, i) => ({
    id: `g-${i}`, path: `/work/${i}`, label: `Directory ${i}`,
  })) }
  assert.throws(() => addWorkspace(catalog, { id: '101', path: '/work/101', label: 'One more' }), /limit/i)
})
