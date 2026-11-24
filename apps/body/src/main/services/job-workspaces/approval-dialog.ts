import { app, BrowserWindow, dialog } from 'electron'
import { lstatSync, realpathSync } from 'node:fs'
import { dirname, parse } from 'node:path'
import type { DesktopApproval, DesktopApprovalHooks, DesktopDecision } from '../backend-lifecycle/job-approval-frames'
import { grantApprovedDirectory } from './index'

const displayPath = (path: string) => path.replace(/[\p{Cf}\p{Cc}\p{Zl}\p{Zp}]/gu,
  char => `\\u{${char.codePointAt(0)!.toString(16).toUpperCase()}}`)
const grantRoot = (request: DesktopApproval) => request.operation === 'ls' ? request.path : dirname(request.path)
const directoryIdentity = (root: string) => {
  const stat = lstatSync(root)
  if (!stat.isDirectory() || realpathSync(root) !== root) throw Error('Job 授权目录已更改')
  return `${stat.dev}:${stat.ino}`
}
const confirmedDirectories = new WeakMap<DesktopApproval, string>()

export const desktopJobApprovals: DesktopApprovalHooks = {
  async ask(request, signal) {
    const root = grantRoot(request)
    const permanent = root !== parse(root).root && root !== app.getPath('home') && dirname(root) !== parse(root).root
    let identity: string | undefined
    if (permanent) {
      try { identity = directoryIdentity(root) } catch { /* Only the one-time option is offered. */ }
    }
    const decisions: DesktopDecision[] = identity ? ['once', 'directory', 'deny'] : ['once', 'deny']
    const display = displayPath(request.path)
    const suspicious = display !== request.path || /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Cyrillic}\p{Script=Greek}]/u.test(request.path)
    const operation = { read: '读取文件', write: '写入文件', ls: '列出目录' }[request.operation]
    const options = {
      type: 'warning' as const, title: 'Job 请求文件访问权限', message: `允许 Job ${operation}吗？`,
      detail: `目标路径\n${display}\n\nJob ${request.jobId}`
        + (identity ? `\n\n长期授权目录（后续 Job 可读写）\n${displayPath(root)}` : '')
        + (suspicious ? '\n\n路径含方向控制符、不可见字符或可能混淆的字符，请核对。' : ''),
      buttons: decisions.map(item => ({ once: '仅允许这次', directory: '长期允许此目录', deny: '拒绝' })[item]),
      defaultId: decisions.length - 1, cancelId: decisions.length - 1, noLink: true, signal,
    }
    const parent = BrowserWindow.getFocusedWindow()
    const { response } = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
    if (signal.aborted) return 'deny'
    const decision = decisions[response] ?? 'deny'
    if (decision === 'directory') {
      if (!identity || identity !== directoryIdentity(root)) return 'deny'
      confirmedDirectories.set(request, identity)
    }
    return decision
  },
  persist(request) {
    try {
      const root = grantRoot(request)
      if (confirmedDirectories.get(request) !== directoryIdentity(root)) throw Error('Job 授权目录已更改')
      grantApprovedDirectory(root)
    }
    catch { void dialog.showMessageBox({ type: 'warning', message: 'Job 目录长期授权未保存', detail: '本次操作已批准。请在设置的“Job 授权目录”中检查目录册。' }) }
  },
}
