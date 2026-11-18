const { spawn } = require('node:child_process')
const { mkdtempSync, mkdirSync, symlinkSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const root = join(__dirname, '..')
async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'human-startup-window-'))
  try {
    mkdirSync(join(directory, 'main'))
    for (const name of ['preload', 'renderer']) symlinkSync(join(root, 'apps/body/out', name), join(directory, name), 'dir')
    const entry = join(directory, 'main/fixture.cjs')
    await require('esbuild').build({ entryPoints: [join(__dirname, 'fixtures/startup-window.electron.ts')], outfile: entry,
      bundle: true, platform: 'node', format: 'cjs', external: ['electron'],
      plugins: [{ name: 'asset-path', setup(build) {
        build.onResolve({ filter: /\?asset$/ }, args => ({ path: args.path, namespace: 'asset' }))
        build.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'module.exports = ""' }))
      } }] })
    for (const mode of ['fast', 'slow', 'failure', 'large-font']) {
      const env = { ...process.env, HUMAN_TEST_STARTUP_MODE: mode, HUMAN_TEST_USER_DATA: join(directory, mode),
        HUMAN_TEST_FONT_SCALE: mode === 'large-font' ? '1.25' : '1' }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.ELECTRON_RENDERER_URL
      await new Promise((resolve, reject) => {
        const child = spawn(require('electron'), [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] })
        let output = '', errors = ''
        const timer = setTimeout(() => { child.kill(); reject(Error('Startup window test timeout')) }, 30000)
        child.stdout.on('data', data => { output += data })
        child.stderr.on('data', data => { errors = (errors + data).slice(-5000) })
        child.once('error', error => { clearTimeout(timer); reject(error) })
        child.once('exit', code => {
          clearTimeout(timer)
          if (code !== 0 || !output.includes('STARTUP_WINDOW_PASS=')) reject(Error(output + errors))
          else { console.log(output.trim()); resolve() }
        })
      })
    }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
