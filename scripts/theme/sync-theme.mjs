/** Synchronize shared variables, never upgrade or rebuild existing page layouts. */
import { readFileSync, readdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DESIGNS_DIR } from './tokens.mjs'
import { synchronizeDocument } from './sync-document.mjs'
const args = process.argv.slice(2)
const index = args.indexOf('--dir')
const directory = index < 0 ? DESIGNS_DIR : resolve(args[index + 1] || '')
const check = args.includes('--check')
function files(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? files(path) : entry.isFile() && entry.name.endsWith('.pen') ? [path] : []
  })
}
try {
  if (index >= 0 && !args[index + 1]) throw Error('--dir requires a directory')
  const tokens = JSON.parse(readFileSync(join(directory, 'theme.tokens.json'), 'utf8'))
  // Parse and validate every file before the first mutation.
  const plans = files(directory).map(path => {
    const before = JSON.parse(readFileSync(path, 'utf8'))
    const after = synchronizeDocument(before, tokens)
    return { path, after, changed: JSON.stringify(before) !== JSON.stringify(after) }
  })
  for (const plan of plans) {
    if (!plan.changed) continue
    console.log(`${check ? 'STALE' : 'SYNC'} ${plan.path}`)
    if (!check) {
      const temporary = plan.path + `.sync-${process.pid}`
      try { writeFileSync(temporary, JSON.stringify(plan.after, null, 2) + '\n', { flag: 'wx' }); renameSync(temporary, plan.path) }
      finally { rmSync(temporary, { force: true }) }
    }
  }
  const changed = plans.filter(plan => plan.changed).length
  console.log(`Theme sync: ${plans.length} files, ${changed} ${check ? 'pending' : 'updated'}`)
  if (check && changed) process.exitCode = 1
} catch (error) { console.error(`Theme sync failed: ${error.message}`); process.exitCode = 1 }
