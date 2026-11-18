import { ElectronAPI } from '@electron-toolkit/preload'

export interface Api {
  initialTheme: import('../shared/theme').ThemeSnapshot
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
