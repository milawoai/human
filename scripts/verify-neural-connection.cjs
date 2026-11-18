const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')
const directory = mkdtempSync(join(tmpdir(), 'human-neural-connection-'))
try {
  const outfile = join(directory, 'connection.test.cjs')
  require('esbuild').buildSync({ entryPoints: [join(__dirname, 'fixtures/neural-connect.test.ts')], outfile,
    bundle: true, platform: 'node', format: 'cjs' })
  process.exitCode = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' }).status ?? 1
} finally { rmSync(directory, { recursive: true, force: true }) }
