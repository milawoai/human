/** Async quit cannot rely on will-quit awaiting a callback. */
export function installAsyncQuit(app: {
  on(event: 'before-quit', listener: (event: { preventDefault(): void }) => void): unknown
  quit(): void
}, close: () => Promise<void>, report: (error: unknown) => void): void {
  let complete = false, pending: Promise<void> | undefined
  app.on('before-quit', event => {
    if (complete) return
    event.preventDefault()
    pending ??= Promise.resolve().then(close).catch(report).finally(() => { complete = true; app.quit() })
  })
}

/** macOS/Linux system shutdown is a separate event from ordinary app quit. */
export function installSessionQuit(power: {
  on(event: 'shutdown', listener: (...args: any[]) => void): unknown
}, app: { quit(): void }): void {
  power.on('shutdown', (...args) => {
    args[0]?.preventDefault?.()
    app.quit()
  })
}
