import { app, Menu, nativeImage, Tray } from 'electron'
import trayIconPath from '../../resources/tray-capterTemplate@2x.png?asset'
import { savePetSettings } from './services/config'
import { checkServerStatus, getServerPort, startServer, stopServer } from './services/server'
import { WindowManager } from './windowManager'

let tray: Tray | null = null
let serverOperating = false

type ServerMenuState = 'on' | 'off' | 'operating'

const getServerMenuLabel = (state: ServerMenuState) => {
  const labelMap: Record<ServerMenuState, string> = {
    on: '开',
    off: '关',
    operating: '修改中'
  }

  return `服务器(${getServerPort()}): ${labelMap[state]}`
}

const getServerMenuState = async (): Promise<ServerMenuState> => {
  if (serverOperating) return 'operating'

  const status = await checkServerStatus()
  if (status.isWorking) return 'operating'

  return status.isAlive ? 'on' : 'off'
}

export const refreshTrayMenu = async () => {
  if (!tray) return

  const windowManager = WindowManager.getInstance()
  const serverState = await getServerMenuState()
  const serverIsOn = serverState === 'on'
  const openPetWindow = () => windowManager.createPetWindow()
  const openSettingsWindow = () => windowManager.showMainWindow('/pet-settings')

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开 Live2D',
        click: openPetWindow
      },
      {
        label: getServerMenuLabel(serverState),
        enabled: serverState !== 'operating',
        click: async () => {
          await toggleServerFromTray(serverIsOn)
        }
      },
      {
        label: '模型设置',
        click: () => windowManager.showMainWindow('/config')
      },
      {
        label: '配置页',
        click: openSettingsWindow
      },
      { type: 'separator' },
      {
        label: '关闭',
        click: () => {
          app.quit()
        }
      }
    ])
  )
}

const toggleServerFromTray = async (serverIsOn: boolean) => {
  if (serverOperating) return

  serverOperating = true
  await refreshTrayMenu()

  try {
    if (serverIsOn) {
      await stopServer()
      await savePetSettings({ startServerOnStart: false })
    } else {
      await startServer()
      await savePetSettings({ startServerOnStart: true })
    }
  } catch (error) {
    console.error('[Tray] 切换服务器失败:', error)
  } finally {
    serverOperating = false
    await refreshTrayMenu()
  }
}

export const initializeTray = () => {
  if (tray) return tray

  const icon = nativeImage.createFromPath(trayIconPath)
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('桌面秘书')

  const windowManager = WindowManager.getInstance()
  const openPetWindow = () => windowManager.createPetWindow()

  tray.on('click', openPetWindow)
  tray.on('right-click', () => {
    refreshTrayMenu()
  })
  refreshTrayMenu()

  return tray
}
