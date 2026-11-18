interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean
  quit(): void
  on(event: 'second-instance', listener: () => void): unknown
}
export function acquireDesktopInstance(app: SingleInstanceApp, focus: () => void): boolean {
  if (!app.requestSingleInstanceLock()) { app.quit(); return false }
  app.on('second-instance', focus)
  return true
}
/** All service connections must happen after persisted configuration is loaded. */
export async function prepareDesktop(load: () => Promise<unknown>,
  configure: () => Promise<unknown>, start: () => Promise<unknown>): Promise<void> {
  await load()
  await configure()
  await start()
}
