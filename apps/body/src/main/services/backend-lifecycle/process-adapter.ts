import { randomBytes, randomUUID } from 'node:crypto'
import type { BackendName } from '../../../shared/backendLifecycle'
import type { BackendConfig } from './config'
import type { BackendPorts } from './ports'
import type { RuntimeCommand } from './runtime-resolver'
// @ts-expect-error Node strip-types needs a .ts extension.
import { ServiceProbe } from './health-probe.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { waitUntil } from './deadline.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { spawnRuntime, isRunning, signalOwnedGroup, waitExit, assertGroupGone, reapOwnedGroup, groupAlive } from './platform-process.ts'
import type { ProcessRecord } from './platform-process'
import { setTimeout as sleep } from 'node:timers/promises'
export class ProcessBackendPorts implements BackendPorts {
  readonly probeClient: ServiceProbe
  private readonly records = new Map<BackendName, ProcessRecord>()
  private readonly commands: (name: BackendName) => RuntimeCommand
  private readonly config: BackendConfig
  private readonly log: (line: string) => void
  private readonly ownerId = randomUUID()
  constructor(config: BackendConfig, deploymentId: string, commands: (name: BackendName) => RuntimeCommand, log: (line: string) => void = () => {}) {
    this.config = config; this.commands = commands; this.log = log
    this.probeClient = new ServiceProbe(config, deploymentId)
  }
  ownedAlive(name: BackendName): boolean { const record = this.records.get(name); return !!record && isRunning(record) }
  probe(name: BackendName, signal: AbortSignal) { return this.probeClient.probe(name, signal) }
  async launch(name: BackendName, signal: AbortSignal) {
    signal.throwIfAborted()
    if (this.config[name].policy !== 'auto') throw Error(`${name}: connect-only forbids process creation`)
    if (this.records.has(name)) throw Error(`${name}: owned process already exists`)
    const command = this.commands(name), instanceId = randomUUID(), token = randomBytes(32).toString('hex')
    const env = { ...process.env, HUMAN_RUNTIME_OWNED: '1', HUMAN_DEPLOYMENT_ID: command.deploymentId,
      PORT: String(this.config.node.port), HUMAN_PYTHON_PORT: String(this.config.python.port),
      HUMAN_NEURAL_URL: `${this.probeClient.url('node')}/neural`, HUMAN_PYTHON_URL: this.probeClient.url('python') }
    const child = spawnRuntime(command, env)
    let resolveExit!: () => void
    const exited = new Promise<void>(resolve => { resolveExit = resolve })
    child.once('exit', resolveExit); child.once('error', resolveExit)
    child.stdin.on('error', () => {})
    const record = { child, exited, instanceId, token }
    this.records.set(name, record)
    // Never forward subprocess payloads: they may contain transcriptions or secrets.
    child.stdout.on('data', () => {}); child.stderr.on('data', () => {})
    child.stdin.write(JSON.stringify({ type: 'bootstrap', protocolVersion: 1, ownerInstanceId: this.ownerId,
      expectedServiceInstanceId: instanceId, ownerToken: token, neuralUrl: env.HUMAN_NEURAL_URL }) + '\n')
    this.log(`${name}: spawned owned process`)
    return { instanceId }
  }
  async waitReady(name: BackendName, instanceId: string, signal: AbortSignal) {
    const record = this.records.get(name)
    await waitUntil(async () => {
      if (record && !isRunning(record)) throw Error(`${name}: owned process exited during startup`)
      try { return await this.probeClient.ready(name, instanceId, signal) }
      catch (error) { signal.throwIfAborted(); return false }
    }, { now: Date.now, sleep: (ms, abort) => sleep(ms, undefined, { signal: abort }) }, signal, 120000, 500)
  }
  async stop(name: BackendName, child: { instanceId: string }, reason: 'restart' | 'shutdown' = 'shutdown') {
    const record = this.records.get(name)
    if (!record || record.instanceId !== child.instanceId) throw Error('Owned instance mismatch')
    const deadline = Date.now() + 7000
    let forced = false
    if (isRunning(record)) {
      try {
        const identity = await this.probeClient.identity(name, AbortSignal.timeout(1500))
        if (identity.instanceId === record.instanceId) await fetch(`${this.probeClient.url(name)}/runtime/shutdown`, {
          method: 'POST', headers: { 'x-human-owner-token': record.token }, signal: AbortSignal.timeout(1500), redirect: 'error' })
      } catch { /* A starting service may not have HTTP yet; stdin EOF still works. */ }
      record.child.stdin.end()
      if (!await waitExit(record, Math.max(0, deadline - Date.now() - 4000))) {
        forced = true
        signalOwnedGroup(record, 'SIGTERM')
        if (!await waitExit(record, 1000)) { signalOwnedGroup(record, 'SIGKILL'); await waitExit(record, 1000) }
      }
    }
    if (isRunning(record)) throw Error(`${name}: did not exit`)
    if (groupAlive(record)) forced = true
    await reapOwnedGroup(record)
    assertGroupGone(record)
    if (reason !== 'restart' && record.child.exitCode !== null && record.child.exitCode !== 0) throw Error(`${name}: exited with code ${record.child.exitCode}`)
    this.records.delete(name)
    this.log(`${name}: owned process exited (${forced ? 'forced' : 'graceful'})`)
  }
}
