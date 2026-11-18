import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, webUtils, ipcRenderer, webFrame } from 'electron'
import { defaultTheme, themeBootstrapCss, themeScheme } from '../shared/theme'
const initialTheme = ipcRenderer.sendSync('theme-bootstrap') ?? { ...defaultTheme, revision: 0 }
void webFrame.insertCSS(themeBootstrapCss(initialTheme))
window.addEventListener('DOMContentLoaded', () => {
  if (document.documentElement.dataset.humanTheme) return
  document.documentElement.dataset.humanTheme = initialTheme.id
  document.documentElement.classList.toggle('app-dark', themeScheme(initialTheme.id) === 'dark')
}, { once: true })

// Custom APIs for renderer
const api = {
  initialTheme,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  platform: {
    isMacOS: process.platform === 'darwin',
    isLinux: process.platform === 'linux',
    isWindows: process.platform === 'win32'
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
