export type BackendName = 'node' | 'python'
export type BackendPolicy = 'auto' | 'connect-only'
export type BackendPhase = 'stopped' | 'probing' | 'starting' | 'registering' |
  'ready' | 'degraded' | 'conflict' | 'stopping' | 'failed'
export interface BackendStatus {
  phase: BackendPhase
  ownership?: 'owned' | 'external'
  instanceId?: string
  error?: string
}
export type BackendPolicies = Record<BackendName, BackendPolicy>
export type BackendSnapshot = Record<BackendName, BackendStatus>
