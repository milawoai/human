import type { BackendConfig, BackendName, BackendPolicy } from '../../../shared/backendLifecycle'
export const BACKEND_CONFIG_KEY = 'backendLifecycle'
export type { BackendConfig } from '../../../shared/backendLifecycle'
type Source = 'default' | 'legacy' | 'saved' | 'environment' | 'argument'
const port = (value: unknown): number => {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) throw Error('Invalid backend port')
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw Error('Backend port must be 1..65535')
  return parsed
}
const policy = (value: unknown): BackendPolicy => {
  if (value !== 'auto' && value !== 'connect-only') throw Error('Invalid backend policy')
  return value
}
export function resolveBackendConfig(saved: unknown, legacy: Record<string, unknown>,
  env: Record<string, string | undefined>, argv: string[]) {
  const config: BackendConfig = { schemaVersion: 1,
    node: { policy: 'auto', host: '127.0.0.1', port: 12002 },
    python: { policy: 'auto', host: '127.0.0.1', port: 12003 } }
  const sources: Record<BackendName, Source> = { node: 'default', python: 'default' }
  if (saved !== undefined && saved !== null) {
    const input = saved as BackendConfig
    if (input.schemaVersion !== 1) throw Error('Unsupported backend config schema')
    for (const name of ['node', 'python'] as const) {
      if (input[name]?.host !== '127.0.0.1') throw Error('Only loopback backend host is supported')
      config[name] = { host: '127.0.0.1', port: port(input[name].port), policy: policy(input[name].policy) }
      sources[name] = 'saved'
    }
  } else if (legacy.nest_port !== undefined && legacy.nest_port !== '') {
    config.node.port = port(legacy.nest_port)
    sources.node = 'legacy'
  }
  // Capture persisted/migrated state before ephemeral env/argv overrides.
  const persisted = structuredClone(config)
  for (const name of ['node', 'python'] as const) {
    const key = `HUMAN_BACKEND_${name.toUpperCase()}_POLICY`
    if (env[key] !== undefined) { config[name].policy = policy(env[key]); sources[name] = 'environment' }
    const portKey = `HUMAN_BACKEND_${name.toUpperCase()}_PORT`
    if (env[portKey] !== undefined) { config[name].port = port(env[portKey]); sources[name] = 'environment' }
    if (argv.includes('--backend-connect-only')) { config[name].policy = 'connect-only'; sources[name] = 'argument' }
  }
  if (config.node.port === config.python.port || persisted.node.port === persisted.python.port) throw Error('Backend ports must be distinct')
  return { config, persisted, sources }
}
export function backendTargets(config: BackendConfig) {
  const node = `http://${config.node.host}:${config.node.port}`
  return { node, python: `http://${config.python.host}:${config.python.port}`,
    neuralHttp: `${node}/neural`, neuralWs: `${node}/neural`, pythonNeural: `${node}/neural` }
}

export function captureBackendOverrides(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] =>
    /^HUMAN_BACKEND_(NODE|PYTHON)_(PORT|POLICY)$/.test(entry[0]) && entry[1] !== undefined))
}
