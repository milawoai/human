const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const root = join(__dirname, '..')
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test',
  'apps/body/src/main/services/backend-lifecycle/tests/process.integration.ts',
  'apps/body/src/main/services/backend-lifecycle/tests/job-approval.test.ts'], { cwd: root, stdio: 'inherit' })
process.exitCode = result.status ?? 1
