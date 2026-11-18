import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node strip-types needs a .ts extension.
import { BackendCoordinator } from './coordinator.ts'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}
function fixture(overrides: Record<string, unknown> = {}) {
  const events: string[] = []
  const ports = {
    probe: async (name: string) => { events.push(`probe:${name}`); return { kind: 'absent' as const } },
    launch: async (name: string) => { events.push(`launch:${name}`); return { instanceId: `${name}-instance` } },
    waitReady: async (name: string) => { events.push(`ready:${name}`) },
    stop: async (name: string) => { events.push(`stop:${name}`) },
    ...overrides
  }
  const coordinator = new BackendCoordinator({ node: 'auto', python: 'auto' }, ports)
  return { events, coordinator }
}

test('starts in dependency order, coalesces concurrent starts and stops Python before Node', async () => {
  const { coordinator, events } = fixture()
  const first = coordinator.start()
  assert.equal(coordinator.start(), first)
  await first
  assert.deepEqual(events, ['probe:node', 'launch:node', 'ready:node', 'probe:python', 'launch:python', 'ready:python'])
  await coordinator.shutdown()
  assert.deepEqual(events.slice(-2), ['stop:python', 'stop:node'])
  assert.equal(coordinator.snapshot().python.phase, 'stopped')
  await coordinator.shutdown()
  assert.equal(events.filter(e => e.startsWith('stop:')).length, 2)
})

test('external and mixed services are never stopped', async () => {
  const { coordinator, events } = fixture({ probe: async (name: string) =>
    name === 'node' ? { kind: 'compatible', instanceId: 'external' } : { kind: 'absent' } })
  await coordinator.start()
  assert.equal(coordinator.snapshot().node.ownership, 'external')
  await coordinator.shutdown()
  assert.deepEqual(events.filter(e => e.startsWith('stop:')), ['stop:python'])
})

test('connect-only and unknown port conflicts never launch or stop anything', async () => {
  for (const kind of ['absent', 'unknown', 'incompatible']) {
    const { coordinator, events } = fixture({ probe: async () => ({ kind, reason: 'fixture conflict' }) })
    coordinator.setPolicies({ node: 'connect-only', python: 'connect-only' })
    await assert.rejects(coordinator.start())
    assert.equal(events.length, 0)
    assert.equal(coordinator.snapshot().node.phase, kind === 'absent' ? 'failed' : 'conflict')
    await coordinator.shutdown()
  }
})

test('shutdown during probe prevents a late launch', async () => {
  const probe = deferred<{ kind: 'absent' }>()
  const { coordinator, events } = fixture({ probe: () => probe.promise })
  const running = coordinator.start()
  await coordinator.shutdown()
  probe.resolve({ kind: 'absent' })
  await assert.rejects(running)
  assert(!events.some(e => e.startsWith('launch:')))
  assert.equal(coordinator.snapshot().node.phase, 'stopped')
})

test('a child returned after shutdown is reclaimed, never made ready', async () => {
  const child = deferred<{ instanceId: string }>()
  const launching = deferred<void>()
  const { coordinator, events } = fixture({ launch: () => { launching.resolve(); return child.promise } })
  const running = coordinator.start()
  await launching.promise
  const shutdown = coordinator.shutdown()
  child.resolve({ instanceId: 'late-child' })
  await assert.rejects(running)
  await shutdown
  assert.deepEqual(events.filter(e => e.startsWith('stop:')), ['stop:node'])
  assert(!events.includes('ready:node'))
})

test('registration wait cancels without waiting for an uncooperative probe', async () => {
  const waiting = deferred<void>()
  const ready = deferred<void>()
  const { coordinator, events } = fixture({ waitReady: () => { waiting.resolve(); return ready.promise } })
  const running = coordinator.start()
  await waiting.promise
  await coordinator.shutdown()
  ready.resolve()
  await assert.rejects(running)
  assert.deepEqual(events.filter(e => e.startsWith('stop:')), ['stop:node'])
  assert.equal(coordinator.snapshot().node.phase, 'stopped')
})

test('stop failure remains visible and still attempts Node cleanup', async () => {
  const { coordinator, events } = fixture({ stop: async (name: string) => {
    events.push(`stop:${name}`)
    if (name === 'python') throw Error('process remains alive')
  } })
  await coordinator.start()
  await assert.rejects(coordinator.shutdown(), /process remains alive/)
  assert.equal(coordinator.snapshot().python.phase, 'failed')
  assert(events.includes('stop:node'))
})

test('health reports are instance-scoped and recovery reuses the owned child', async () => {
  const { coordinator, events } = fixture()
  await coordinator.start()
  coordinator.reportDegraded('node', 'stale-instance', 'stale failure')
  assert.equal(coordinator.snapshot().node.phase, 'ready')
  coordinator.reportDegraded('node', 'node-instance', 'registration lost')
  assert.equal(coordinator.snapshot().node.phase, 'degraded')
  await coordinator.start()
  assert.equal(coordinator.snapshot().node.phase, 'ready')
  assert.equal(events.filter(e => e === 'launch:node').length, 1)
  await coordinator.shutdown()
})
