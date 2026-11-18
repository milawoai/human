import type { BackendName } from '../../../shared/backendLifecycle'
import type { BackendCoordinator } from './coordinator'
import type { ProcessBackendPorts } from './process-adapter'
// @ts-expect-error Node strip-types needs a .ts extension.
import { RecoveryBudget } from './recovery-budget.ts'
export function monitorBackends(coordinator: BackendCoordinator, ports: ProcessBackendPorts,
  onUnavailable: () => Promise<void>, report: (message: string) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined, stopped = false
  const failures = { node: 0, python: 0 }
  const budgets = { node: new RecoveryBudget(), python: new RecoveryBudget() }
  const controller = new AbortController()
  async function tick() {
    try {
      for (const name of ['node', 'python'] as BackendName[]) {
        const state = coordinator.snapshot()[name]
        if (stopped || !state.instanceId || ['stopped', 'stopping', 'starting', 'registering'].includes(state.phase)) continue
        let ready = false
        try { ready = await ports.probeClient.ready(name, state.instanceId, controller.signal) } catch { /* counted below */ }
        if (stopped) return
        if (ready) {
          failures[name] = 0
          if (state.phase !== 'ready') await coordinator.start()
          continue
        }
        if (++failures[name] < 3 && (state.ownership !== 'owned' || ports.ownedAlive(name))) continue
        coordinator.reportDegraded(name, state.instanceId, `${name}: HTTP or registration is unavailable`)
        await onUnavailable()
        if (stopped) return
        if (state.ownership === 'owned' && !ports.ownedAlive(name)) {
          if (!budgets[name].take(Date.now())) { report(`${name}: automatic restart limit reached`); continue }
          await coordinator.restartOwned(name)
        } else {
          try { await coordinator.start() } catch (error) {
            if (stopped || state.ownership !== 'owned' || !budgets[name].take(Date.now())) throw error
            await coordinator.restartOwned(name)
          } // external remains external, even if missing
        }
      }
    } catch (error) { if (!stopped) report(String(error)) }
    finally { if (!stopped) timer = setTimeout(() => { void tick() }, 5000) }
  }
  timer = setTimeout(() => { void tick() }, 5000)
  return () => { stopped = true; clearTimeout(timer); controller.abort() }
}
