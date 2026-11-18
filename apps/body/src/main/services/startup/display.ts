import type { EventEmitter } from 'node:events'

interface StartupWindow extends EventEmitter {
  webContents: EventEmitter
  isVisible(): boolean
  isDestroyed(): boolean
}
/** Start the minimum duration on actual visibility, never on construction. */
export function waitForStartupDisplay(window: StartupWindow, signal: AbortSignal,
  minimumMs = 1000, loadTimeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let visibleTimer: ReturnType<typeof setTimeout> | undefined
    let loadTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error) => {
      clearTimeout(visibleTimer); clearTimeout(loadTimer)
      window.removeListener('show', shown)
      window.removeListener('closed', closed)
      window.webContents.removeListener('did-fail-load', loadFailed)
      window.webContents.removeListener('render-process-gone', crashed)
      signal.removeEventListener('abort', aborted)
      if (error) reject(error); else resolve()
    }
    const shown = () => {
      if (visibleTimer) return
      clearTimeout(loadTimer)
      const start = performance.now()
      const check = () => {
        const remaining = minimumMs - (performance.now() - start)
        if (remaining > 0) visibleTimer = setTimeout(check, Math.ceil(remaining))
        else finish()
      }
      check()
    }
    const closed = () => finish(Error('启动窗口提前关闭'))
    const aborted = () => finish(signal.reason ?? Error('启动已取消'))
    const crashed = () => finish(Error('启动窗口渲染进程异常'))
    const loadFailed = (_event: unknown, _code: number, description: string, _url: string, mainFrame: boolean) => {
      if (mainFrame) finish(Error(`启动窗口加载失败: ${description}`))
    }
    window.on('show', shown)
    window.once('closed', closed)
    window.webContents.on('did-fail-load', loadFailed)
    window.webContents.once('render-process-gone', crashed)
    signal.addEventListener('abort', aborted, { once: true })
    loadTimer = setTimeout(() => finish(Error('启动窗口显示超时')), loadTimeoutMs)
    if (signal.aborted) aborted()
    else if (window.isDestroyed()) closed()
    else if (window.isVisible()) shown()
  })
}
