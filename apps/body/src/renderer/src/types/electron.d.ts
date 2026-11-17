export interface Api {
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    api: Api
    electron: any
  }
}
