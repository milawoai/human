import { app } from 'electron'
import { join } from 'node:path'
import { LifecycleManager } from '../../apps/body/src/main/services/backend-lifecycle/manager'
import { installAsyncQuit } from '../../apps/body/src/main/services/backend-lifecycle/shutdown'
const root = process.env.HUMAN_TEST_ROOT!
app.setPath('userData', process.env.HUMAN_TEST_USER_DATA!)
if (!app.requestSingleInstanceLock()) app.exit(1)
const nodePort = Number(process.env.HUMAN_TEST_NODE_PORT), pythonPort = Number(process.env.HUMAN_TEST_PYTHON_PORT)
const config = { schemaVersion: 1 as const,
  node: { policy: 'auto' as const, host: '127.0.0.1' as const, port: nodePort },
  python: { policy: 'auto' as const, host: '127.0.0.1' as const, port: pythonPort } }
const manager = new LifecycleManager(config, root, name => name === 'node' ? {
  executable: process.env.HUMAN_TEST_NODE_EXECUTABLE!, args: ['-r', join(root, 'node_modules/ts-node/register/transpile-only'),
    join(root, 'apps/backend/src/runtime/tests/desktop/fixture.ts')], cwd: join(root, 'apps/backend'), deploymentId: root
} : { executable: join(root, 'apps/python-service/.venv/bin/python'), args: ['-m', 'runtime.runner'],
  cwd: join(root, 'apps/python-service'), deploymentId: root }, {
    nodeReady: async () => {}, unavailable: async () => {}, publish: () => {}, log: () => {} })
installAsyncQuit(app, () => manager.close(), error => console.error(String(error)))
app.whenReady().then(async () => {
  app.dock?.hide()
  try {
    await manager.start()
    const get = async (port: number, route: string) => (await fetch(`http://127.0.0.1:${port}${route}`)).json() as Promise<any>
    const node = await get(nodePort, '/runtime/identity'), python = await get(pythonPort, '/runtime/identity')
    const worker = await get(nodePort, '/fixture/worker')
    console.log('LIFECYCLE_READY=' + JSON.stringify([node.pid, python.pid, worker.pid]))
    process.stdin.once('data', () => app.quit())
  } catch (error) { console.error(String(error)); app.quit() }
})
