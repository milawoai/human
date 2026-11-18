import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadTokens } from './tokens.mjs'
const command = fileURLToPath(new URL('./use-theme.mjs', import.meta.url))
function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'human-theme-use-')), tokens = loadTokens()
  tokens.defaultTheme = 'dark'
  mkdirSync(join(directory, 'themes'))
  writeFileSync(join(directory, 'theme.tokens.json'), JSON.stringify(tokens))
  writeFileSync(join(directory, 'theme.pen'), JSON.stringify({ children: [] }))
  writeFileSync(join(directory, 'other.pen'), JSON.stringify({ version: '2.8', children: [{ id: 'keep', type: 'frame', width: 700, theme: { mode: 'dark' } }] }))
  const preset = { id: 'paper-white', ...tokens.themes['paper-white'] }
  writeFileSync(join(directory, 'themes/paper-white.json'), JSON.stringify(preset))
  const cli = (...args) => spawnSync(process.execPath, [command, ...args, '--dir', directory], { encoding: 'utf8' })
  const read = file => JSON.parse(readFileSync(join(directory, file), 'utf8'))
  try { run({ directory, tokens, preset, cli, read }) } finally { rmSync(directory, { recursive: true, force: true }) }
}
test('select by ID imports edited preset, sets default, rebuilds theme board and syncs other designs', () => fixture(({ directory, tokens, preset, cli, read }) => {
  preset.tokens.bg = '#FFFAF5'
  writeFileSync(join(directory, 'themes/paper-white.json'), JSON.stringify(preset))
  const result = cli('paper-white'); assert.equal(result.status, 0, result.stderr)
  const after = read('theme.tokens.json'), pen = read('theme.pen')
  assert.equal(read('themes/paper-white.json').generatedFrom, '../theme.tokens.json#themes/paper-white');
  assert.equal(after.defaultTheme, 'paper-white'); assert.equal(after.themes['paper-white'].tokens.bg, '#FFFAF5')
  assert.deepEqual(after.common, tokens.common); assert.deepEqual(after.themes.dark, tokens.themes.dark)
  assert.equal(pen.children[0].theme.mode, 'paper-white'); assert(pen.children[0].children.length > 0)
  assert.equal(pen.variables.bg.value.find(v => v.theme.mode === 'paper-white').value, '#FFFAF5')
  assert.equal(read('other.pen').children[0].id, 'keep'); assert.equal(read('other.pen').children[0].theme.mode, 'dark')
  assert.equal(read('other.pen').variables.bg.value.find(v => v.theme.mode === 'paper-white').value, '#FFFAF5')
}))
test('accepts a preset JSON path; listing is read-only', () => fixture(({ directory, cli, read }) => {
  assert.equal(cli('--list').status, 0); assert.equal(read('theme.tokens.json').defaultTheme, 'dark')
  const result = cli(join(directory, 'themes/paper-white.json')); assert.equal(result.status, 0, result.stderr)
  assert.equal(read('theme.tokens.json').defaultTheme, 'paper-white')
}))
test('missing fields, bad mode, malformed palette or invalid design fail before changing either output', () => {
  for (const change of [p => delete p.tokens.text, p => { p.scheme = 'sepia' }, p => { p.tokens.bg = 'oops' }, p => { p.id = '../oops' }, p => { p.id = 123 }]) fixture(({ directory, cli, preset }) => {
    const before = readFileSync(join(directory, 'theme.tokens.json'), 'utf8'), pen = readFileSync(join(directory, 'theme.pen'), 'utf8')
    change(preset); writeFileSync(join(directory, 'themes/paper-white.json'), JSON.stringify(preset))
    assert.notEqual(cli('paper-white').status, 0)
    assert.equal(readFileSync(join(directory, 'theme.tokens.json'), 'utf8'), before); assert.equal(readFileSync(join(directory, 'theme.pen'), 'utf8'), pen)
  })
  fixture(({ directory, cli }) => {
    const before = readFileSync(join(directory, 'theme.tokens.json'), 'utf8')
    writeFileSync(join(directory, 'other.pen'), '{bad')
    assert.notEqual(cli('paper-white').status, 0); assert.equal(readFileSync(join(directory, 'theme.tokens.json'), 'utf8'), before)
  })
})
