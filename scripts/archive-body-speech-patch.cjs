/* Mechanical archive only: Body is a gitlink without its own Git metadata. */
const { writeFileSync, existsSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const baseline = process.argv[2]
if (!baseline) throw new Error('Usage: node scripts/archive-body-speech-patch.cjs <pre-change-body-directory>')
const files = [
  'package.json',
  'src/shared/agent-panel.ts',
  'src/shared/agent-panel.test.ts',
  'src/shared/session-speech.ts',
  'src/shared/session-speech.test.ts',
  'src/shared/speech-playback.ts',
  'src/shared/speech-playback.test.ts',
  'src/shared/live2dPerformance.ts',
  'src/shared/datas/ipc.ts',
  'src/main/services/live2d/index.ts',
  'src/renderer/src/pages/pet/index.vue',
  'src/main/services/sense/impl/hearing/index.ts',
  'src/renderer/src/pages/agent-panel/index.vue',
  'src/renderer/src/pages/chat-panel/index.vue'
]
let patch = ''
for (const relative of files) {
  const path = `apps/body/${relative}`
  const before = join(baseline, relative)
  const existed = existsSync(before)
  if (!existed && !/session-speech\.|speech-playback\./.test(relative)) throw new Error(`Missing baseline: ${before}`)
  const result = spawnSync('git', ['diff', '--no-index', '--', existed ? before : '/dev/null', path], { encoding: 'utf8' })
  if (result.status > 1 || result.error) throw new Error(result.stderr || String(result.error))
  patch += result.stdout.split('\n').map(line => {
    if (line.startsWith('diff --git ')) return `diff --git a/${path} b/${path}`
    if (line.startsWith('--- ')) return existed ? `--- a/${path}` : '--- /dev/null'
    if (line.startsWith('+++ ')) return `+++ b/${path}`
    return line
  }).join('\n')
}
writeFileSync('patches/body-session-speech-summary.patch', patch)
console.log(`Archived ${files.length} Body files, ${Buffer.byteLength(patch)} bytes`)
