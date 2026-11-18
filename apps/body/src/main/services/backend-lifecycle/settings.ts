import store from '../../store'
import { BACKEND_CONFIG_KEY, resolveBackendConfig } from './config'

/** Persist migration once; temporary development overrides are not saved. */
export function loadBackendSettings() {
  const legacy = store.get<Record<string, unknown>>('config_folders') ?? {}
  const settings = resolveBackendConfig(store.get(BACKEND_CONFIG_KEY), legacy, process.env, process.argv)
  store.set(BACKEND_CONFIG_KEY, settings.persisted)
  if ('nest_port' in legacy) {
    const { nest_port: _oldPort, ...remaining } = legacy
    store.set('config_folders', remaining)
  }
  return settings
}
