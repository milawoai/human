import type { BackendName, BackendPolicies, BackendSnapshot, BackendStatus } from '../../../shared/backendLifecycle'
import type { BackendPorts, OwnedBackend } from './ports'
// @ts-expect-error Node strip-types needs a .ts extension.
import { cancellable } from './cancellation.ts'

/** Pure coordinator. OS/process deadlines belong to injected adapters. */
export class BackendCoordinator {
  private policies: BackendPolicies
  private readonly ports: BackendPorts
  private readonly controller = new AbortController()
  private readonly children = new Map<BackendName, OwnedBackend>()
  private readonly launching = new Set<Promise<void>>()
  private starting?: Promise<void>
  private stopping?: Promise<void>
  private state: BackendSnapshot = { node: { phase: 'stopped' }, python: { phase: 'stopped' } }

  constructor(policies: BackendPolicies, ports: BackendPorts) {
    this.policies = { ...policies }
    this.ports = ports
  }

  snapshot(): BackendSnapshot {
    return { node: { ...this.state.node }, python: { ...this.state.python } }
  }

  setPolicies(policies: BackendPolicies): void {
    if (this.starting || this.children.size || this.stopping) throw Error('Lifecycle is active')
    this.policies = { ...policies }
  }

  start(): Promise<void> {
    if (this.stopping) return Promise.reject(Error('Lifecycle is stopping'))
    if (this.starting) return this.starting
    const run = this.startService('node').then(() => this.startService('python'))
    this.starting = run
    void run.finally(() => { if (this.starting === run) this.starting = undefined }).catch(() => {})
    return run
  }

  reportDegraded(name: BackendName, instanceId: string, error: string): void {
    if (this.stopping || this.state[name].instanceId !== instanceId || this.state[name].phase !== 'ready') return
    this.update(name, { phase: 'degraded', error })
    if (name === 'node' && this.state.python.phase === 'ready') {
      this.update('python', { phase: 'degraded', error: 'Neural dependency is unavailable' })
    }
  }

  shutdown(): Promise<void> {
    if (this.stopping) return this.stopping
    this.controller.abort(Error('Lifecycle cancelled for shutdown'))
    for (const name of ['node', 'python'] as const) this.update(name, { phase: 'stopping' })
    this.stopping = this.stopServices()
    return this.stopping
  }

  private update(name: BackendName, changes: Partial<BackendStatus>): void {
    this.state[name] = { ...this.state[name], ...changes }
  }

  private async startService(name: BackendName): Promise<void> {
    const signal = this.controller.signal
    signal.throwIfAborted()
    if (this.state[name].phase === 'ready') return
    this.update(name, { phase: 'probing', error: undefined })
    try {
      let child = this.children.get(name)
      if (!child) {
        const probe = await cancellable(this.ports.probe(name, signal), signal)
        signal.throwIfAborted()
        if (probe.kind === 'unknown' || probe.kind === 'incompatible') {
          this.update(name, { phase: 'conflict' })
          throw Error(probe.reason)
        }
        if (probe.kind === 'compatible') {
          this.update(name, { ownership: 'external', instanceId: probe.instanceId })
        } else {
          if (this.policies[name] !== 'auto') throw Error(`${name}: connect-only service is absent`)
          this.update(name, { phase: 'starting' })
          const launch = this.ports.launch(name, signal).then(result => { this.children.set(name, result) })
          this.launching.add(launch)
          void launch.finally(() => this.launching.delete(launch)).catch(() => {})
          await cancellable(launch, signal)
          signal.throwIfAborted()
          child = this.children.get(name)!
          this.update(name, { ownership: 'owned', instanceId: child.instanceId })
        }
      }
      this.update(name, { phase: 'registering' })
      await cancellable(this.ports.waitReady(name, this.state[name].instanceId!, signal), signal)
      signal.throwIfAborted()
      this.update(name, { phase: 'ready' })
    } catch (error) {
      if (!signal.aborted) {
        this.update(name, { phase: this.state[name].phase === 'conflict' ? 'conflict' : 'failed', error: String(error) })
      }
      throw error
    }
  }

  private async stopServices(): Promise<void> {
    // A process returned late by a launcher must also be reclaimed. Launch adapters
    // must settle within their deadline, even when cancelled before bootstrap.
    await Promise.allSettled([...this.launching])
    const errors: unknown[] = []
    for (const name of ['python', 'node'] as const) {
      this.update(name, { phase: 'stopping' })
      const child = this.children.get(name)
      try {
        if (child) await this.ports.stop(name, child)
        this.children.delete(name)
        this.state[name] = { phase: 'stopped' }
      } catch (error) {
        errors.push(error)
        this.update(name, { phase: 'failed', error: String(error) })
      }
    }
    if (errors.length) throw new AggregateError(errors, errors.map(String).join('; '))
  }
}
