import { shallowRef } from 'vue'
import { defaultTheme, themeVariables } from '@shared/theme'
import type { ThemeSnapshot } from '@shared/theme'
import { ThemeReceiver } from '@shared/theme-receiver'
export const currentTheme = shallowRef<ThemeSnapshot>({ ...defaultTheme, revision: -1 })
export function initializeRendererTheme() {
  const root = document.documentElement
  const receiver = new ThemeReceiver(snapshot => {
    for (const [key, value] of Object.entries(themeVariables(snapshot))) root.style.setProperty(key, value)
    root.dataset.humanTheme = snapshot.id
    root.classList.toggle('app-dark', snapshot.id === 'dark')
    currentTheme.value = snapshot
  })
  const ipc = window.electron.ipcRenderer
  ipc.on('theme:changed', (_event, snapshot) => receiver.accept(snapshot))
  receiver.accept(window.api.initialTheme ?? { ...defaultTheme, revision: 0 })
  void ipc.invoke('theme-status').then(result => { if (result.success) receiver.accept(result.data) })
}
