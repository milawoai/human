/* Mechanical diff archive. Includes only Agent runtime management, not parallel model-config UI. */
const fs = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const baseline = process.argv[2]
if (!baseline) throw Error('Usage: node scripts/archive-body-agent-runs-patch.cjs <pre-change-body-directory>')
const files = ['src/shared/agent-panel.ts', 'src/shared/agent-panel.test.ts', 'src/main/services/agent/index.ts', 'src/main/services/agent/bridge.ts', 'src/shared/datas/ipc.ts', 'src/renderer/src/pages/agent-panel/index.vue', 'src/main/services/neural/impl/neural-http.ts']
const temp = fs.mkdtempSync('/private/tmp/human-agent-patch-')
let output = ''
for (const relative of files) {
  const before = join(baseline, relative)
  let after = `apps/body/${relative}`
  if (!fs.existsSync(before)) throw Error(`Missing baseline ${before}`)
  if (relative === 'src/shared/datas/ipc.ts') {
    // Other work added a modelConfig IPC group concurrently. Do not archive it twice.
    const original = fs.readFileSync(before, 'utf8')
    const anchor = "    run: { desc: '执行 Pi Agent 任务' },"
    if (!original.includes(anchor)) throw Error('IPC baseline anchor missing')
    const insertion = "\n    getRun: { desc: '查询 Pi Agent 运行状态' },\n    cancelRun: { desc: '取消指定 Pi Agent 运行' },"
    if (!fs.readFileSync(after, 'utf8').includes(insertion.trim())) throw Error('Expected Agent IPC changes missing')
    after = join(temp, 'ipc.ts')
    fs.writeFileSync(after, original.replace(anchor, anchor + insertion))
  }
  const result = spawnSync('git', ['diff', '--no-index', '--unified=2', '--', before, after], { encoding: 'utf8' })
  if (result.status > 1) throw Error(result.stderr)
  const target = `apps/body/${relative}`
  output += result.stdout.split('\n').map(line => line.startsWith('diff --git ') ? `diff --git a/${target} b/${target}` : line.startsWith('--- ') ? `--- a/${target}` : line.startsWith('+++ ') ? `+++ b/${target}` : line).join('\n')
}
fs.writeFileSync('patches/body-agent-run-management.patch', output)
console.log(`Archived ${files.length} scoped files; ${Buffer.byteLength(output)} bytes`)
const replay = fs.mkdtempSync('/private/tmp/human-agent-replay-')
fs.mkdirSync(join(replay, 'apps'), { recursive: true })
fs.cpSync(baseline, join(replay, 'apps/body'), { recursive: true })
const patch = require('node:path').resolve('patches/body-agent-run-management.patch')
for (const args of [['apply', '--check', patch], ['apply', patch]]) {
  const result = spawnSync('git', ['-C', replay, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw Error(result.stderr)
}
for (const relative of files) {
  const expected = relative === 'src/shared/datas/ipc.ts' ? fs.readFileSync(join(temp, 'ipc.ts'), 'utf8') : fs.readFileSync(`apps/body/${relative}`, 'utf8')
  if (fs.readFileSync(join(replay, 'apps/body', relative), 'utf8') !== expected) throw Error(`Replay mismatch: ${relative}`)
}
console.log('Independent replay and exact comparison: PASS (parallel modelConfig changes excluded)')
