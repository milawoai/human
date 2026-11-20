import type { BackendName, BackendSnapshot } from '../../../shared/backendLifecycle'
import type { BackendConfig } from './config'
import type { RuntimeCommand } from './runtime-resolver'
import type { DesktopApprovalHooks } from './job-approval-frames'
// @ts-expect-error Node strip-types needs a .ts extension.
import { BackendCoordinator } from './coordinator.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { ProcessBackendPorts } from './process-adapter.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { monitorBackends } from './monitor.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { cancellable } from './cancellation.ts'
export interface LifecycleHooks {
  nodeReady(instanceId: string, signal: AbortSignal): Promise<void>
  unavailable(): Promise<void>
  publish(snapshot: BackendSnapshot): void
  log(message: string): void
  diagnostic?(message: string): void
  approvals?: DesktopApprovalHooks
}
export class LifecycleManager {
  readonly coordinator: BackendCoordinator
  readonly ports: ProcessBackendPorts
  private stopMonitor?: () => void
  private closing?: Promise<void>
  constructor(config: BackendConfig, deploymentId: string, commands: (name: BackendName) => RuntimeCommand, hooks: LifecycleHooks) {
    this.ports = new ProcessBackendPorts(config, deploymentId, commands, hooks.log, hooks.diagnostic, hooks.approvals)
    const waitReady = this.ports.waitReady.bind(this.ports)
    this.ports.waitReady = async (name, instance, signal) => {
      await waitReady(name, instance, signal)
      if (name === 'node') await cancellable(hooks.nodeReady(instance, signal), signal)
    }
    this.coordinator = new BackendCoordinator({ node: config.node.policy, python: config.python.policy }, this.ports, hooks.publish)
    this.hooks = hooks
  }
  private readonly hooks: LifecycleHooks
  async start(): Promise<void> {
    try { await this.coordinator.start() }
    finally {
      if (!this.closing && !this.stopMonitor) this.stopMonitor = monitorBackends(this.coordinator, this.ports, this.hooks.unavailable, this.hooks.log)
    }
  }
  snapshot() { return this.coordinator.snapshot() }
  restart(name: BackendName) { return this.coordinator.restartOwned(name) }
  close(): Promise<void> {
    if (this.closing) return this.closing
    this.stopMonitor?.()
    // Abort first so startup cannot wait for the recording-stop request.
    this.coordinator.cancelStartup()
    this.closing = (async () => {
      let audioError: unknown
      try { await this.hooks.unavailable() } catch (error) { audioError = error }
      await this.coordinator.shutdown()
      if (audioError) throw audioError
    })()
    return this.closing
  }
}
