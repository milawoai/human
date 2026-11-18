const { spawn } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const root = join(__dirname, '..')
async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'human-theme-test-'))
  const entry = join(directory, 'theme.cjs')
  require('esbuild').buildSync({ entryPoints: [join(__dirname, 'fixtures/theme.electron.ts')], outfile: entry,
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'],
    nodePaths: [join(root, 'node_modules')] })
  try {
    const env = { ...process.env, HUMAN_TEST_ROOT: root, HUMAN_TEST_USER_DATA: join(directory, 'data'), NODE_PATH: join(root, 'node_modules') }
    delete env.ELECTRON_RUN_AS_NODE
    for (const restore of ['0', '1']) await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), [entry], { env: { ...env, HUMAN_TEST_RESTORE: restore }, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = '', errors = ''
      const timer = setTimeout(() => { child.kill(); reject(Error('Theme test timeout: ' + errors)) }, 60000)
      child.stdout.on('data', value => { output += value })
      child.stderr.on('data', value => { errors = (errors + value).slice(-6000) })
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => {
        clearTimeout(timer)
        if (code !== 0 || !output.includes(restore === '1' ? 'THEME_RESTART_PASS=' : 'THEME_INHERIT_PASS=')) reject(Error(output + errors))
        else { console.log(output.split('\n').filter(line => line.startsWith('THEME_')).join('\n')); resolve() }
      })
    })
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
