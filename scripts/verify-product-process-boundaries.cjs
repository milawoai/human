const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
const entries = ['apps/body/src/main/index.ts', 'apps/body/src/main/services/backend-lifecycle',
  'apps/backend/src/runtime', 'apps/python-service/runtime']
function files(relative) {
  const full = path.join(root, relative)
  if (fs.statSync(full).isDirectory()) return fs.readdirSync(full).flatMap(name => files(path.join(relative, name)))
  return /\.(ts|py)$/.test(relative) && !/\.test\.ts$|[/\\]tests[/\\]/.test(relative) ? [relative] : []
}
let count = 0
for (const file of entries.flatMap(files)) {
  const text = fs.readFileSync(path.join(root, file), 'utf8')
  const forbid = [/dev-cleanup/, /['"`]\s*(?:lsof|pkill|kill)(?:\s|['"`])/, /shell\s*:\s*true/]
  if (forbid.some(pattern => pattern.test(text))) throw Error(`Product process boundary violation: ${file}`)
  if (file.includes('apps/body') && !file.endsWith('platform-process.ts') && /process\.kill\s*\(|\.child\.kill\s*\(/.test(text)) {
    throw Error(`Process termination outside the platform adapter: ${file}`)
  }
  count++
}
console.log(`PASS: product process boundaries (${count} files)`)
