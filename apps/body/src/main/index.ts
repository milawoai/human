/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 00:17:46
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-04-17 17:18:54
 * @FilePath: /copy_code_desk/src/main/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1-fileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { initialGlobalShortcut, quitGlobalShortcut } from './globalShortcuts'
import { initializeHandlers } from './handler'
import { getPetSettings, initialConfigs } from './services/config/index'
import { startServer } from './services/server/index'
import { runStartupSettings } from './startupSettings'
import { initializeTray, refreshTrayMenu } from './trayManager'
import { WindowManager } from './windowManager'
import { acquireDesktopInstance } from './services/backend-lifecycle/desktop-startup'
import { startupProgress } from './services/startup'
import { waitForStartupDisplay } from './services/startup/display'
import { runStartupTasks } from './services/startup/tasks'
import { configureBackendServices, startBackendServices, closeBackendServices } from './services/backend-lifecycle'
import { installAsyncQuit, installSessionQuit } from './services/backend-lifecycle/shutdown'

const primaryInstance = acquireDesktopInstance(app, () => {
  if (app.isReady()) WindowManager.getInstance().showMainWindow('/pet-settings')
  else void app.whenReady().then(() => WindowManager.getInstance().showMainWindow('/pet-settings'))
})

let isQuitting = false
const startupController = new AbortController()

function createWindow(): BrowserWindow {
  const windowManager = WindowManager.getInstance()
  const mainWindow = windowManager.createMainWindow({ showOnReady: false })

  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow.hide()
  })

  return mainWindow
}

const applyStartupSettings = async () => {
  const windowManager = WindowManager.getInstance()
  const settings = await getPetSettings()

  await runStartupSettings(settings, {
    openLive2D: () => {
      console.log('[Main] 启动配置要求打开 Live2D Pet 窗口')
      windowManager.createPetWindow()
    },
    startServer,
    refreshTrayMenu,
    onServerStartError: (error) => {
      console.error('[Main] 默认启动本地服务失败:', error)
    }
  })
}

/** Main UI stays reachable while backend registration is pending. */
async function initializeApp() {
  const windows = WindowManager.getInstance()
  createWindow()
  windows.createHelloWindow()
  const hello = windows.getHelloWindow()
  const displayed = hello
    ? waitForStartupDisplay(hello, startupController.signal)
    : Promise.reject(Error('启动窗口创建失败'))
  // Observe immediately: loading may fail while backends are still starting.
  void displayed.catch(() => {})
  try {
    await runStartupTasks(startupProgress, async () => {
      await initialConfigs()
      startupController.signal.throwIfAborted()
      await configureBackendServices()
    }, startBackendServices)
  } catch (error) {
    console.error('[Main] Backend startup:', (error as Error).message)
    startupProgress.fail('启动失败，请打开设置与诊断')
  } finally {
    try { await displayed } catch (error) { startupProgress.fail((error as Error).message) }
    windows.closeHelloWindow()
  }
  if (isQuitting) return
  if (startupProgress.snapshot().state === 'failed') windows.showMainWindow('/pet-settings')
  else await applyStartupSettings()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
if (primaryInstance) app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  app.dock?.hide()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  installSessionQuit(powerMonitor, app)
  initializeHandlers()
  initializeTray()
  initialGlobalShortcut()

  // 启动初始化流程：HelloWindow → 连接 Neural → 继续启动
  try {
    await initializeApp()
  } catch (error) {
    console.error('[Main] Backend configuration failed:', (error as Error).message)
    createWindow()
    WindowManager.getInstance().showMainWindow('/pet-settings')
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      return
    }

    WindowManager.getInstance().showMainWindow('/pet-settings')
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // Tray app stays alive. Use tray menu "关闭" to quit explicitly.
})

// Ordinary quit is asynchronous; hiding a window never enters this path.
installAsyncQuit(app, async () => {
  isQuitting = true
  startupController.abort(Error('应用正在退出'))
  quitGlobalShortcut()
  await closeBackendServices()
}, error => console.error('[Main] Backend shutdown incomplete:', String(error)))
