import { ElectronAPI } from '@electron-toolkit/preload'

export interface Api {
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
