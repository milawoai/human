/** Import one preset into the active registry, then rebuild/synchronize designs. */
import { readFileSync, readdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DESIGNS_DIR } from './tokens.mjs'
import { buildThemeDocument } from './build-theme-pen.mjs'
import { synchronizeDocument } from './sync-document.mjs'

export function selectTheme(tokens, preset) {
  if (!preset || typeof preset.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(preset.id ?? '')) throw Error('Invalid preset id')
  if (typeof preset.label !== 'string' || !preset.label.trim()) throw Error('Preset label is required')
  if (!['dark', 'light'].includes(preset.scheme)) throw Error('Preset scheme must be dark or light')
  if (preset.description !== undefined && typeof preset.description !== 'string') throw Error('Invalid preset description')
  const expected = Object.keys(tokens.themes.dark.tokens).sort()
  if (!preset.tokens || JSON.stringify(Object.keys(preset.tokens).sort()) !== JSON.stringify(expected)) throw Error('Preset must contain exactly the shared palette keys')
  for (const [key, value] of Object.entries(preset.tokens)) {
    if (typeof value !== 'string' || !value.trim()) throw Error(`Invalid token: ${key}`)
    if (key !== 'shadow' && !/^#(?:[\da-f]{6}|[\da-f]{8})$/i.test(value)) throw Error(`Token ${key} requires a 6/8-digit hex color`)
  }
  const next = structuredClone(tokens)
  next.themes[preset.id] = { label: preset.label, scheme: preset.scheme,
    ...(preset.description === undefined ? {} : { description: preset.description }), tokens: preset.tokens }
  next.defaultTheme = preset.id
  return next
}
function penFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? penFiles(path) : entry.isFile() && path.endsWith('.pen') ? [path] : []
  })
}
export function useTheme(input, directory = DESIGNS_DIR) {
  const path = /^[a-z0-9-]+(?:\.json)?$/.test(input) ? join(directory, 'themes', input.replace(/\.json$/, '') + '.json') : resolve(input)
  const registryPath = join(directory, 'theme.tokens.json'), boardPath = join(directory, 'theme.pen')
  const tokens = selectTheme(JSON.parse(readFileSync(registryPath, 'utf8')), JSON.parse(readFileSync(path, 'utf8')))
  // Resolve and validate all outputs before replacing any file.
  const designs = penFiles(directory).filter(path => path !== boardPath).map(path => ({ path, value: synchronizeDocument(JSON.parse(readFileSync(path, 'utf8')), tokens) }))
  const id = tokens.defaultTheme
  const plans = [ { path: registryPath, value: tokens }, { path: boardPath, value: buildThemeDocument(tokens) }, ...designs,
    { path: join(directory, 'themes', id + '.json'), value: { id, generatedFrom: `../theme.tokens.json#themes/${id}`, ...tokens.themes[id] } } ]
  const staged = []
  try {
    for (const plan of plans) {
      const temporary = plan.path + `.use-${process.pid}`
      staged.push({ path: plan.path, temporary })
      writeFileSync(temporary, JSON.stringify(plan.value, null, 2) + '\n', { flag: 'wx' })
    }
    for (const plan of staged) renameSync(plan.temporary, plan.path)
  } finally { for (const plan of staged) rmSync(plan.temporary, { force: true }) }
  console.log(`Theme selected: ${tokens.defaultTheme}; imported ${path}`)
  console.log(`Rebuilt theme.pen and synchronized ${designs.length} other design(s). Existing Electron preferences are preserved.`)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), index = args.indexOf('--dir')
    if (index >= 0 && !args[index + 1]) throw Error('--dir requires a directory')
    const directory = index >= 0 ? resolve(args.splice(index, 2)[1]) : DESIGNS_DIR
    if (!args.length || args[0] === '--list' || args[0] === '--help') {
      console.log('Usage: yarn theme:use <preset-id | JSON-path>\nAvailable presets:')
      console.log(readdirSync(join(directory, 'themes')).filter(name => name.endsWith('.json')).sort().map(name => '  ' + name.slice(0, -5)).join('\n'))
    } else {
      if (args.length !== 1 || args[0].startsWith('-')) throw Error('Expected one preset ID or JSON path')
      useTheme(args[0], directory)
    }
  } catch (error) { console.error(`Theme selection failed: ${error.message}`); process.exitCode = 1 }
}
