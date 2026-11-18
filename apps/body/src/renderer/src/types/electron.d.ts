export interface Api {
  initialTheme: import('@shared/theme').ThemeSnapshot
  getPathForFile: (file: File) => string
}

declare global {
  interface Window {
    api: Api
    electron: any
  }
}
