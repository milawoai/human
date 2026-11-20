import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import store from '../../store'
import { WindowManager } from '../../windowManager'
import { connectNeural, disconnectNeural, neuralTrigger, onNeuralStateChange } from '../neural'
import { stopHearing } from '../sense'
import { loadBackendSettings } from './settings'
import { BACKEND_CONFIG_KEY, resolveBackendConfig, backendTargets } from './config'
import { setNeuralTarget } from '../neural/impl/targets'
import { attachJobWorkspaceCatalog, projectRoot, resolveRuntime } from './runtime-resolver'
import { syncWorkspaceCatalog } from '../job-workspaces'
import { LifecycleManager } from './manager'
import { ServiceProbe } from './health-probe'
import { createLifecycleLog } from './rotating-log'
import { publishAvailability } from './availability'
import type { BackendName } from '../../../shared/backendLifecycle'
let manager: LifecycleManager | undefined
let effective: ReturnType<typeof loadBackendSettings> | undefined
let businessError: string | undefined
let configurationError: string | undefined
let quitting = false
let applying = false
let neuralListenerInstalled = false
const initialized = new Set<string>()
let startupNodeReady: ((error?: string) => void) | undefined
const log = (message: string) => createLifecycleLog(join(app.getPath('userData'), 'logs/backend-lifecycle.log'))(message)
export async function configureBackendServices(): Promise<void> {
  if (quitting) throw Error('Application is quitting')
  try { effective = loadBackendSettings(); configurationError = undefined }
  catch (error) { configurationError = String(error); throw error }
  setNeuralTarget(backendTargets(effective.config).neuralHttp)
  const root = app.isPackaged ? app.getAppPath() : projectRoot(app.getAppPath())
  await syncWorkspaceCatalog()
  const workspaceCatalogPath = join(app.getPath('userData'), 'job-workspaces.json')
  manager = new LifecycleManager(effective.config, root, name => attachJobWorkspaceCatalog(name,
    resolveRuntime(name, root, app.isPackaged), workspaceCatalogPath), {
    approvals: desktopJobApprovals,
    nodeReady: async (instance, signal) => {
      await disconnectNeural()
      signal.throwIfAborted()
      const connected = await connectNeural()
      signal.throwIfAborted()
      if (!connected.success) throw Error(connected.msg || 'Body Neural registration failed')
      if (!initialized.has(instance)) {
        initialized.add(instance)
        try {
          const result = await neuralTrigger({ kind: 'command', topic: 'brain.init.execute', payload: {} }, { timeoutMs: 10000 })
          businessError = result.success ? undefined : '业务初始化失败，请查看配置'
        } catch { businessError = '业务初始化失败，请查看配置' }
      }
    },
    unavailable: async () => { await stopHearing() },
    publish: snapshot => {
      if (snapshot.node.phase === 'ready' && startupNodeReady) {
        const notify = startupNodeReady
        startupNodeReady = undefined
        notify(businessError)
      }
      publishAvailability(snapshot)
      log(`node=${snapshot.node.phase}/${snapshot.node.ownership ?? '-'} python=${snapshot.python.phase}/${snapshot.python.ownership ?? '-'}`)
      for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('backend:state', snapshot)
    }, log, diagnostic: message => {
      if (!app.isPackaged) console.warn(`[backend] ${message}`)
    }
  })
  if (!neuralListenerInstalled) {
    neuralListenerInstalled = true
    onNeuralStateChange(state => {
      if (state === 'disconnected' || state === 'error') {
        const node = manager?.snapshot().node
        if (node?.instanceId) manager?.coordinator.reportDegraded('node', node.instanceId, 'Body Neural connection is unavailable')
      }
    })
  }
}
export async function startBackendServices(onBrainReady?: (error?: string) => void): Promise<void> {
  if (quitting || applying) throw Error('Application is quitting or applying configuration')
  if (!manager) throw Error('Backend configuration is not ready')
  if (onBrainReady) startupNodeReady = onBrainReady
  try { await manager.start() }
  finally { if (startupNodeReady === onBrainReady) startupNodeReady = undefined }
}
export async function closeBackendServices(): Promise<void> {
  quitting = true
  try { await manager?.close() } finally { await disconnectNeural() }
}
export async function status() { return { snapshot: manager?.snapshot(), config: effective?.config ?? resolveBackendConfig(undefined, {}, {}, []).config, sources: effective?.sources, businessError, configurationError } }
export async function retry() { await startBackendServices(); return status() }
export async function restart(name: BackendName) {
  if (quitting || applying || !manager || !['node', 'python'].includes(name)) throw Error('Invalid backend restart request')
  await manager.restart(name)
  return status()
}
export async function applyConfig(input: unknown) {
  if (applying || quitting) throw Error('Backend configuration is busy')
  applying = true
  try { return await applyBackendConfig(input) } finally { applying = false }
}
async function applyBackendConfig(input: unknown) {
  if (quitting) throw Error('Application is quitting')
  const next = resolveBackendConfig(input, {}, {}, []).persisted
  const root = app.isPackaged ? app.getAppPath() : projectRoot(app.getAppPath())
  const preflight = new ServiceProbe(next, root)
  for (const name of ['node', 'python'] as const) {
    if (effective?.config[name].port === next[name].port) continue
    const target = await preflight.probe(name, AbortSignal.timeout(2000))
    if (target.kind === 'unknown' || target.kind === 'incompatible') throw Error(target.reason)
  }
  await manager?.close()
  await disconnectNeural()
  store.set(BACKEND_CONFIG_KEY, next)
  await configureBackendServices()
  try { await manager!.start() } catch { /* Status remains available for repair. */ }
  return status()
}
export async function openSettings() { WindowManager.getInstance().showMainWindow('/pet-settings') }
import { desktopJobApprovals } from '../job-workspaces/approval-dialog'
