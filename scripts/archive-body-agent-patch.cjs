/* Generate the Body delta against this task's four preserved baseline files. */
const { writeFileSync, existsSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const baseline = process.argv[2]
if (!baseline) throw new Error('Usage: node scripts/archive-body-agent-patch.cjs <baseline-directory>')
const files = {
  'apps/body/package.json': 'package.json',
  'apps/body/src/shared/datas/ipc.ts': 'ipc.ts',
  'apps/body/src/renderer/src/router/index.ts': 'router.ts',
  'apps/body/src/renderer/src/pages/pet/index.vue': 'pet.vue',
  'apps/body/src/shared/agent-panel.ts': null,
  'apps/body/src/shared/agent-panel.test.ts': null,
  'apps/body/src/main/services/agent/bridge.ts': null,
  'apps/body/src/main/services/agent/bridge.test.ts': null,
  'apps/body/src/main/services/agent/index.ts': null,
  'apps/body/src/renderer/src/pages/agent-panel/index.vue': null
}
let patch = ''
for (const [path, name] of Object.entries(files)) {
  const old = name ? join(baseline, name) : '/dev/null'
  if (name && !existsSync(old)) throw new Error(`Missing baseline: ${old}`)
  const result = spawnSync('git', ['diff', '--no-index', '--', old, path], { encoding: 'utf8' })
  if (result.status > 1 || result.error) throw new Error(result.stderr || String(result.error))
  patch += result.stdout.split('\n').map(line => {
    if (line.startsWith('diff --git ')) return `diff --git a/${path} b/${path}`
    if (line.startsWith('--- ')) return name ? `--- a/${path}` : '--- /dev/null'
    if (line.startsWith('+++ ')) return `+++ b/${path}`
    return line
  }).join('\n')
}
writeFileSync('patches/body-agent-test-panel.patch', patch)
console.log(`Archived ${Object.keys(files).length} files, ${Buffer.byteLength(patch)} bytes`)
