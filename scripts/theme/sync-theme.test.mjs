import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { synchronizeDocument } from './sync-document.mjs'
import { loadTokens, buildVariables } from './tokens.mjs'
const tokens = loadTokens()
test('legacy page adopts shared variables without changing layout, IDs or schema', () => {
  const before = { version: '2.8', themes: { size: ['compact'] }, variables: {
    'bg-panel': { type: 'color', value: '#111111' }, 'text-secondary': { type: 'color', value: '#999999' },
    local: { type: 'color', value: '#123456' }
  }, children: [{ id: 'card', type: 'frame', width: 800, height: 600, fill: '$bg-panel',
    stroke: { fill: '$text-secondary', thickness: 1 }, children: [
      { id: 'text', type: 'text', content: '$bg-panel', fill: '$text-secondary', fontSize: 14 },
      { id: 'icon', type: 'icon_font', fill: '$local', iconFontName: 'check' },
      { id: 'primary', type: 'frame', fill: '$accent', children: [{ type: 'text', fill: '#0B1220', content: 'Apply' }] }
    ] }] }
  const after = synchronizeDocument(before, tokens)
  assert.equal(before.children[0].fill, '$bg-panel')
  assert.equal(after.version, '2.8')
  assert.equal(after.children[0].width, 800)
  assert.equal(after.children[0].height, 600)
  assert.equal(after.children[0].children[1].type, 'icon_font')
  assert.deepEqual(after.children[0].stroke, { fill: '$text-muted', thickness: 1 })
  assert.equal(after.children[0].children[0].content, '$bg-panel')
  assert.equal(after.children[0].children[0].fontSize, '$font-size-sm')
  assert.equal(after.children[0].children[2].fill, '$accent-strong')
  assert.deepEqual(after.variables.local, before.variables.local)
  assert.deepEqual(after.themes.mode, Object.keys(tokens.themes))
  assert.deepEqual(synchronizeDocument(after, tokens), after)
})
test('additional registered preset is included in the design axis and palette', () => {
  const extra = structuredClone(tokens)
  extra.themes.forest = { ...structuredClone(tokens.themes.dark), label: '森林', scheme: 'dark' }
  extra.themes.forest.tokens.accent = '#88ccaa'
  const doc = synchronizeDocument({ children: [] }, extra)
  assert.deepEqual(doc.themes.mode, [...Object.keys(tokens.themes), 'forest'])
  assert.equal(doc.variables.accent.value.find(entry => entry.theme.mode === 'forest').value, '#88ccaa')
})
test('missing references fail; CLI check is read-only and bad files prevent earlier writes', () => {
  assert.throws(() => synchronizeDocument({ children: [{ fill: '$missing' }] }, tokens), /missing/)
  const directory = mkdtempSync(join(tmpdir(), 'human-theme-sync-'))
  const entry = new URL('./sync-theme.mjs', import.meta.url).pathname
  try {
    writeFileSync(join(directory, 'theme.tokens.json'), JSON.stringify(tokens))
    mkdirSync(join(directory, 'pages'))
    const path = join(directory, 'pages/a.pen'), initial = JSON.stringify({ children: [] })
    writeFileSync(path, initial)
    const run = (...args) => spawnSync(process.execPath, [entry, '--dir', directory, ...args], { encoding: 'utf8' })
    assert.equal(run('--check').status, 1)
    assert.equal(readFileSync(path, 'utf8'), initial)
    writeFileSync(join(directory, 'z.pen'), '{bad')
    assert.equal(run().status, 1)
    assert.equal(readFileSync(path, 'utf8'), initial)
    rmSync(join(directory, 'z.pen'))
    assert.equal(run().status, 0)
    assert.equal(run('--check').status, 0)
    const stable = readFileSync(path, 'utf8')
    assert.equal(run().status, 0)
    assert.equal(readFileSync(path, 'utf8'), stable)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('spatial aliases resolve to shared design dimensions and reject cycles', () => {
  const variables = buildVariables(tokens)
  for (const [key, value] of Object.entries({ 'space-page':32, 'space-card':24, 'space-panel':16, 'radius-control':8, 'radius-card':12, 'radius-window':16 })) assert.equal(variables[key].value, value)
  const modified = structuredClone(tokens)
  modified.common['spacing-6'] = '3rem'
  assert.equal(buildVariables(modified)['space-page'].value, 48)
  modified.common['space-page'] = 'var(--human-space-page)'
  assert.throws(() => buildVariables(modified), /Cyclic/)
})
