import type { BackendName } from '../../../shared/backendLifecycle'
export type ProbeResult = { kind: 'absent' } | { kind: 'compatible'; instanceId: string } |
  { kind: 'unknown' | 'incompatible'; reason: string }
export interface OwnedBackend { instanceId: string }
/** Adapters must use injected endpoints, never implicit default test ports. */
export interface BackendPorts {
  probe(name: BackendName, signal: AbortSignal): Promise<ProbeResult>
  launch(name: BackendName, signal: AbortSignal): Promise<OwnedBackend>
  waitReady(name: BackendName, instanceId: string, signal: AbortSignal): Promise<void>
  stop(name: BackendName, child: OwnedBackend, reason?: 'restart' | 'shutdown'): Promise<void>
}
export interface LifecycleClock {
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
}
