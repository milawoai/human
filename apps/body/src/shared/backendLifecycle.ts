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

export function backendUnavailableReason(snapshot?: BackendSnapshot): string | undefined {
  if (!snapshot) return '正在检测后端服务'
  if (snapshot.node.phase !== 'ready') return snapshot.node.error ?? `后端未就绪：${snapshot.node.phase}`
  if (snapshot.python.phase !== 'ready') return snapshot.python.error ?? `听觉服务未就绪：${snapshot.python.phase}`
  return undefined
}

export interface BackendConfig {
  schemaVersion: 1
  node: { policy: BackendPolicy; host: '127.0.0.1'; port: number }
  python: { policy: BackendPolicy; host: '127.0.0.1'; port: number }
}
export interface BackendLifecycleView {
  snapshot?: BackendSnapshot
  config: BackendConfig
  sources?: Record<BackendName, string>
  businessError?: string
  configurationError?: string
}
