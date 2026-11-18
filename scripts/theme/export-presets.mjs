/** Shareable snapshots; theme.tokens.json remains the editable source of truth. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadTokens, DESIGNS_DIR } from './tokens.mjs'
const check = process.argv.includes('--check'), directory = join(DESIGNS_DIR, 'themes')
if (!check) mkdirSync(directory, { recursive: true })
let stale = 0
for (const [id, preset] of Object.entries(loadTokens().themes)) {
  if (!/^[a-z0-9-]+$/.test(id)) throw Error(`Invalid preset id: ${id}`)
  const path = join(directory, id + '.json')
  const content = JSON.stringify({ id, generatedFrom: `../theme.tokens.json#themes/${id}`, ...preset }, null, 2) + '\n'
  let previous
  try { previous = readFileSync(path, 'utf8') } catch { previous = '' }
  if (content !== previous) {
    stale++
    if (!check) writeFileSync(path, content)
  }
}
console.log(`Preset exports: ${Object.keys(loadTokens().themes).length} files, ${stale} ${check ? 'pending' : 'updated'}`)
if (check && stale) process.exitCode = 1
