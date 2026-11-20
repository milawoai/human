import { app, BrowserWindow, dialog } from 'electron'
import type { MessageBoxOptions, OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import store from '../../store'
import { addWorkspace, createEmptyWorkspaceCatalog, removeWorkspace, setDefaultWorkspace,
  parseWorkspaceCatalog, type JobWorkspaceCatalog } from '../../../shared/jobWorkspaceCatalog'
import { writeWorkspaceCatalogFile } from './catalog-file'

const STORE_KEY = 'jobWorkspaceCatalog'
const catalogPath = () => join(app.getPath('userData'), 'job-workspaces.json')
function readCatalog(): JobWorkspaceCatalog {
  try {
    return parseWorkspaceCatalog(store.get<unknown>(STORE_KEY))
  } catch {
    return createEmptyWorkspaceCatalog()
  }
}
function writeCatalog(catalog: JobWorkspaceCatalog): JobWorkspaceCatalog {
  const previous = readCatalog()
  try {
    writeWorkspaceCatalogFile(catalogPath(), catalog)
    store.set(STORE_KEY, catalog)
    return catalog
  } catch (error) {
    try { writeWorkspaceCatalogFile(catalogPath(), previous) } catch { /* Next launch reconciles from the persisted store. */ }
    throw error
  }
}
const parentWindow = () => BrowserWindow.getFocusedWindow() ?? undefined

export async function getSettings(): Promise<JobWorkspaceCatalog> {
  const catalog = readCatalog()
  writeWorkspaceCatalogFile(catalogPath(), catalog)
  return catalog
}

export async function setDefault(id: string): Promise<JobWorkspaceCatalog> {
  return writeCatalog(setDefaultWorkspace(readCatalog(), id))
}

export async function revoke(id: string): Promise<{ catalog: JobWorkspaceCatalog; revoked: boolean }> {
  const current = readCatalog()
  const selected = current.workspaces.find(item => item.id === id)
  if (!selected) throw new Error('Job workspace is not authorized')
  const options: MessageBoxOptions = {
    type: 'warning', title: '撤销 Job 工作区授权',
    message: `撤销 Job 对“${selected.label}”的访问权限吗？`,
    detail: '已提交的任务如果尚未开始访问文件，也会在下次读写时因授权撤销而失败。',
    buttons: ['撤销授权', '保留授权'], defaultId: 1, cancelId: 1,
  }
  const parent = parentWindow()
  const confirmation = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  const latest = readCatalog()
  if (confirmation.response !== 0) return { catalog: latest, revoked: false }
  if (!latest.workspaces.some(item => item.id === id)) return { catalog: latest, revoked: false }
  return { catalog: writeCatalog(removeWorkspace(latest, id)), revoked: true }
}

export async function addDirectory(): Promise<{ catalog: JobWorkspaceCatalog; outcome: 'added' | 'duplicate' | 'cancelled' | 'denied' }> {
  const pickerOptions: OpenDialogOptions = { title: '选择 Job 工作目录', properties: ['openDirectory', 'createDirectory'] }
  const parent = parentWindow()
  const selection = parent ? await dialog.showOpenDialog(parent, pickerOptions) : await dialog.showOpenDialog(pickerOptions)
  if (selection.canceled || !selection.filePaths[0]) return { catalog: readCatalog(), outcome: 'cancelled' }
  const directory = realpathSync(selection.filePaths[0])
  if (!statSync(directory).isDirectory()) throw new Error('Job 工作区必须是一个文件夹')
  const current = readCatalog()
  if (current.workspaces.some(item => item.path === directory)) return { catalog: current, outcome: 'duplicate' }
  if (current.workspaces.length >= 100) throw new Error('最多只能授权 100 个 Job 工作区')
  const consentOptions: MessageBoxOptions = {
    type: 'warning', title: '授权 Job 访问文件夹',
    message: `允许后台 Job 在此目录中读取和创建/更新文件吗？\n\n${directory}`,
    detail: 'Job 不能删除文件或运行命令。已有文件只有在 Job 明确要求覆盖时才会更新。此授权可随时移除。',
    buttons: ['授权并添加', '取消'], defaultId: 1, cancelId: 1,
  }
  const consent = parent ? await dialog.showMessageBox(parent, consentOptions) : await dialog.showMessageBox(consentOptions)
  const latest = readCatalog()
  if (consent.response !== 0) return { catalog: latest, outcome: 'denied' }
  if (latest.workspaces.some(item => item.path === directory)) return { catalog: latest, outcome: 'duplicate' }
  const catalog = addWorkspace(latest, { id: randomUUID(), path: directory, label: basename(directory) || directory })
  return { catalog: writeCatalog(catalog), outcome: 'added' }
}

export async function syncWorkspaceCatalog(): Promise<void> {
  writeWorkspaceCatalogFile(catalogPath(), readCatalog())
}

export function grantApprovedDirectory(directory: string): void {
  if (realpathSync(directory) !== directory || !statSync(directory).isDirectory()) {
    throw Error('Job authorization directory changed')
  }
  const current = readCatalog()
  if (current.workspaces.some(item => item.path === directory)) return
  if (current.workspaces.length >= 100) throw Error('最多只能授权 100 个 Job 工作区')
  writeCatalog(addWorkspace(current, { id: randomUUID(), path: directory, label: basename(directory) || directory }))
}
