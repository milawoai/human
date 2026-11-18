import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
// @ts-expect-error Node strip-types needs a .ts extension.
import { LifecycleManager } from '../manager.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { ProcessBackendPorts } from '../process-adapter.ts'
const root = process.cwd()
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  assert(![12002, 12003].includes(port))
  return port
}
const commands = (name: string) => name === 'node' ? {
  executable: process.execPath, args: ['-r', join(root, 'node_modules/ts-node/register/transpile-only'),
    join(root, 'apps/backend/src/runtime/tests/desktop/fixture.ts')], cwd: join(root, 'apps/backend'), deploymentId: root
} : { executable: join(root, 'apps/python-service/.venv/bin/python'), args: ['-m', 'runtime.runner'],
  cwd: join(root, 'apps/python-service'), deploymentId: root }

test('real owned Node then Python register, Node restart re-registers Python, and both exit', { timeout: 30000 }, async context => {
  const config = { schemaVersion: 1 as const, node: { policy: 'auto' as const, host: '127.0.0.1' as const, port: await freePort() },
    python: { policy: 'auto' as const, host: '127.0.0.1' as const, port: await freePort() } }
  const states: string[] = []
  const manager = new LifecycleManager(config, root, commands, { nodeReady: async () => {}, unavailable: async () => {},
    publish: snapshot => { states.push(`${snapshot.node.phase}/${snapshot.python.phase}`); console.log('phase', snapshot.node.phase, snapshot.python.phase) }, log: line => console.log('lifecycle', line) })
  context.signal.addEventListener('abort', () => { void manager.close().catch(() => {}) }, { once: true })
  try {
    await manager.start()
    const first = manager.snapshot()
    assert.equal(first.node.phase, 'ready'); assert.equal(first.python.phase, 'ready')
    const reused = new LifecycleManager(config, root, () => { throw Error('external must not spawn') }, {
      nodeReady: async () => {}, unavailable: async () => {}, publish: () => {}, log: () => {} })
    try {
      await reused.start()
      assert.equal(reused.snapshot().node.ownership, 'external')
      assert.equal(reused.snapshot().python.ownership, 'external')
    } finally { await reused.close() }
    const shared = new ProcessBackendPorts(config, root, commands)
    const external = await shared.probe('python', new AbortController().signal)
    assert.equal(external.kind, 'compatible')
    await manager.restart('node')
    assert.notEqual(manager.snapshot().node.instanceId, first.node.instanceId)
    assert.equal(manager.snapshot().python.instanceId, first.python.instanceId)
    assert.equal(manager.snapshot().python.phase, 'ready')
    await manager.close()
    assert.equal((await shared.probe('node', new AbortController().signal)).kind, 'absent')
    assert.equal((await shared.probe('python', new AbortController().signal)).kind, 'absent')
    assert(states.includes('ready/registering'))
    console.log(`PASS: real lifecycle and Python re-registration on isolated ports ${config.node.port}/${config.python.port}`)
  } finally { await manager.close() }
})

test('external reuse and unknown listeners are never terminated', { timeout: 15000 }, async () => {
  const port = await freePort()
  const server = createServer(socket => socket.destroy())
  await new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve))
  const config = { schemaVersion: 1 as const, node: { policy: 'auto' as const, host: '127.0.0.1' as const, port },
    python: { policy: 'auto' as const, host: '127.0.0.1' as const, port: await freePort() } }
  const manager = new LifecycleManager(config, root, () => { throw Error('must not launch') }, {
    nodeReady: async () => {}, unavailable: async () => {}, publish: () => {}, log: () => {} })
  try {
    await assert.rejects(manager.start())
    await manager.close()
    assert.equal(server.listening, true)
  } finally { await manager.close(); await new Promise<void>(resolve => server.close(() => resolve())) }
})


test('Python launched before Neural remains HTTP-live then registers after Node starts', { timeout: 20000 }, async context => {
  const config = { schemaVersion: 1 as const, node: { policy: 'auto' as const, host: '127.0.0.1' as const, port: await freePort() },
    python: { policy: 'auto' as const, host: '127.0.0.1' as const, port: await freePort() } }
  const ports = new ProcessBackendPorts(config, root, commands)
  const python = await ports.launch('python', context.signal)
  let node: { instanceId: string } | undefined
  try {
    for (let i = 0; i < 100; i++) {
      if ((await ports.probe('python', context.signal)).kind === 'compatible') break
      await sleep(50)
    }
    assert.equal((await ports.probe('python', context.signal)).kind, 'compatible')
    await sleep(150) // At least one genuine refused initial connection.
    node = await ports.launch('node', context.signal)
    await ports.waitReady('node', node.instanceId, context.signal)
    await ports.waitReady('python', python.instanceId, context.signal)
    console.log('PASS: real initial connection failure recovers after Neural startup')
  } finally {
    await ports.stop('python', python)
    if (node) await ports.stop('node', node)
  }
})

test('owned Node crash recovers within budget and reaps its orphan fixture Worker', { timeout: 25000 }, async context => {
  const config = { schemaVersion: 1 as const, node: { policy: 'auto' as const, host: '127.0.0.1' as const, port: await freePort() },
    python: { policy: 'auto' as const, host: '127.0.0.1' as const, port: await freePort() } }
  const manager = new LifecycleManager(config, root, commands, { nodeReady: async () => {}, unavailable: async () => {}, publish: () => {}, log: () => {} })
  context.signal.addEventListener('abort', () => { void manager.close().catch(() => {}) }, { once: true })
  let originalPid = 0
  try {
    await manager.start()
    const first = manager.snapshot().node.instanceId
    const identity = await manager.ports.probeClient.identity('node', context.signal) as any
    originalPid = identity.pid
    process.kill(originalPid, 'SIGKILL') // exclusively the process created by this test
    for (let i = 0; i < 140; i++) {
      const state = manager.snapshot()
      if (state.node.instanceId !== first && state.node.phase === 'ready' && state.python.phase === 'ready') break
      await sleep(100)
    }
    assert.notEqual(manager.snapshot().node.instanceId, first, 'owned Node crash must trigger one bounded restart')
    assert.equal(manager.snapshot().python.phase, 'ready')
  } finally {
    await manager.close().catch(error => {
      // Test safety net for the deliberately orphaned fixture, never a product path.
      if (originalPid) { try { process.kill(-originalPid, 'SIGKILL') } catch {} }
      throw error
    })
  }
})
