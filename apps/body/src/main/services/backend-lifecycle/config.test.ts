import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node strip-types needs a .ts extension.
import { resolveBackendConfig, backendTargets, captureBackendOverrides } from './config.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { prepareDesktop, acquireDesktopInstance } from './desktop-startup.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { attachJobWorkspaceCatalog } from './runtime-resolver.ts'

test('legacy port migrates once, saved config wins and endpoints share one source', () => {
  const migrated = resolveBackendConfig(undefined, { nest_port: '13002' }, {}, [])
  assert.equal(migrated.config.node.port, 13002)
  const targets = backendTargets(migrated.config)
  assert.equal(targets.neuralHttp, 'http://127.0.0.1:13002/neural')
  assert.equal(targets.neuralWs, targets.neuralHttp)
  assert.equal(targets.pythonNeural, targets.neuralHttp)
  const saved = resolveBackendConfig(migrated.config, { nest_port: '14002' }, {}, [])
  assert.equal(saved.config.node.port, 13002)
})

test('invalid ports, policies and duplicate ports are rejected', () => {
  for (const nest_port of ['abc', '1.5', '0', '65536', '12003']) {
    assert.throws(() => resolveBackendConfig(undefined, { nest_port }, {}, []))
  }
  assert.throws(() => resolveBackendConfig(undefined, {}, { HUMAN_BACKEND_NODE_POLICY: 'kill-all' }, []))
})

test('connect-only escape flag overrides saved and environment strategies', () => {
  const result = resolveBackendConfig(undefined, {}, { HUMAN_BACKEND_NODE_POLICY: 'auto' }, ['--backend-connect-only'])
  assert.equal(result.config.node.policy, 'connect-only')
  assert.equal(result.config.python.policy, 'connect-only')
  assert.equal(result.sources.node, 'argument')
})

test('no backend action before configuration has loaded, errors prevent connection', async () => {
  const events: string[] = []
  let loaded!: () => void
  const ready = new Promise<void>(r => { loaded = r })
  const starting = prepareDesktop(async () => { await ready; events.push('config') },
    async () => { events.push('targets') }, async () => { events.push('connect') })
  assert.deepEqual(events, [])
  loaded()
  await starting
  assert.deepEqual(events, ['config', 'targets', 'connect'])
  await assert.rejects(prepareDesktop(async () => { throw Error('bad config') },
    async () => { throw Error('must not configure') }, async () => { throw Error('must not connect') }), /bad config/)
})

test('second instance cannot install backend startup and focuses the existing app', () => {
  const events: string[] = []
  const denied = acquireDesktopInstance({ requestSingleInstanceLock: () => false,
    quit: () => { events.push('quit') }, on: () => { events.push('listener') } }, () => {})
  assert.equal(denied, false)
  assert.deepEqual(events, ['quit'])
  let second!: () => void
  assert.equal(acquireDesktopInstance({ requestSingleInstanceLock: () => true,
    quit: () => {}, on: (_name: string, fn: () => void) => { second = fn } }, () => { events.push('focus') }), true)
  second()
  assert(events.includes('focus'))
})


test('explicit launch overrides survive later loading of user env files', () => {
  const inherited = { HUMAN_BACKEND_NODE_POLICY: 'connect-only' }
  const captured = captureBackendOverrides(inherited)
  inherited.HUMAN_BACKEND_NODE_POLICY = 'auto'
  const result = resolveBackendConfig(undefined, {}, { ...inherited, ...captured }, [])
  assert.equal(result.config.node.policy, 'connect-only')
})

test('workspace catalog path is injected into owned Node only', () => {
  const node = { executable: 'node', args: [], cwd: '/app', deploymentId: 'dev' }
  const python = { executable: 'python', args: [], cwd: '/app', deploymentId: 'dev' }
  assert.deepEqual(attachJobWorkspaceCatalog('node', node, '/user/job-workspaces.json').env,
    { HUMAN_JOB_WORKSPACES_FILE: '/user/job-workspaces.json' })
  assert.equal(attachJobWorkspaceCatalog('python', python, '/user/job-workspaces.json').env, undefined)
})
