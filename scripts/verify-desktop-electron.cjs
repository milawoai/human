const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { createServer } = require('node:net')
const { setTimeout: sleep } = require('node:timers/promises')
const root = join(__dirname, '..')
async function freePort() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  assert(![12002, 12003].includes(port))
  return port
}
function alive(pid) { try { process.kill(pid, 0); return true } catch (error) { if (error.code === 'ESRCH') return false; throw error } }
async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'human-electron-lifecycle-'))
  const entry = join(directory, 'fixture.cjs')
  require('esbuild').buildSync({ entryPoints: [join(__dirname, 'fixtures/desktop-lifecycle.electron.ts')], outfile: entry,
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
  try {
    for (const mode of ['quit', 'crash']) {
      const env = { ...process.env, HUMAN_TEST_ROOT: root, HUMAN_TEST_USER_DATA: join(directory, mode),
        HUMAN_TEST_NODE_PORT: String(await freePort()), HUMAN_TEST_PYTHON_PORT: String(await freePort()),
        HUMAN_TEST_NODE_EXECUTABLE: process.execPath }
      delete env.ELECTRON_RUN_AS_NODE
      const child = spawn(require('electron'), [entry], { env, stdio: ['pipe', 'pipe', 'pipe'] })
      const exited = once(child, 'exit')
      let output = '', errors = ''
      child.stdout.on('data', data => { output += data })
      child.stderr.on('data', data => { errors = (errors + data).slice(-4000) })
      try {
        for (let i = 0; i < 400 && !output.includes('LIFECYCLE_READY=') && child.exitCode === null; i++) await sleep(50)
        const match = output.match(/LIFECYCLE_READY=(\[[^\n]+\])/)
        assert(match, errors || 'Electron fixture never became ready')
        const pids = JSON.parse(match[1])
        assert(pids.length === 3 && pids.every(pid => Number.isInteger(pid) && pid > 1))
        if (mode === 'quit') child.stdin.write('quit\n')
        else child.kill('SIGKILL')
        for (let i = 0; i < 200 && (child.exitCode === null && child.signalCode === null || pids.some(alive)); i++) await sleep(50)
        assert(child.exitCode !== null || child.signalCode !== null, 'Electron did not exit')
        assert(pids.every(pid => !alive(pid)), `Owned backend/Worker residual after ${mode}: ${pids.filter(alive)}`)
        console.log(`PASS: real Electron ${mode} reaps owned Node, Python and nested Worker (isolated userData/ports)`)
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        await exited
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
