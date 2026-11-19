import { BrowserWindow, ipcMain } from 'electron'
import store from '../../store'
import { ThemeController } from './controller'
import type { ThemeSnapshot } from '../../../shared/theme'
const key = 'appearance.theme'
let controller: ThemeController
export function initializeTheme(onChanged: (snapshot: ThemeSnapshot) => void = () => {}) {
  controller = new ThemeController(store.get(key), value => store.set(key, value), snapshot => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('theme:changed', snapshot)
    }
    onChanged(snapshot)
  })
  // Synchronous, in-memory bootstrap only; no network or async work in preload.
  ipcMain.on('theme-bootstrap', event => { event.returnValue = controller.snapshot() })
}
export function status() { return controller.snapshot() }
export function set(input: unknown) { return controller.set(input) }
