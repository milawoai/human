import type { PetSettings } from '../shared/petSettings'

interface StartupSettingsDependencies {
  openLive2D: () => void
  startServer: () => Promise<unknown>
  refreshTrayMenu: () => Promise<unknown>
  onServerStartError: (error: unknown) => void
}

export const runStartupSettings = async (
  settings: PetSettings,
  deps: StartupSettingsDependencies
): Promise<void> => {
  if (settings.openLive2DOnStart) {
    deps.openLive2D()
  }

  if (settings.startServerOnStart) {
    void deps
      .startServer()
      .then(() => deps.refreshTrayMenu())
      .catch((error) => deps.onServerStartError(error))
  }
}
