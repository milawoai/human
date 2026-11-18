import { backendUnavailableReason, type BackendSnapshot } from '../../../shared/backendLifecycle'
let current: BackendSnapshot = { node: { phase: 'stopped' }, python: { phase: 'stopped' } }
export function publishAvailability(value: BackendSnapshot): void { current = value }
export function hearingUnavailableReason(): string | undefined {
  return backendUnavailableReason(current)
}
