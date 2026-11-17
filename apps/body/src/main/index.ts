/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 00:17:46
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-04-17 17:18:54
 * @FilePath: /copy_code_desk/src/main/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1-fileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain } from 'electron'
import { initialGlobalShortcut, quitGlobalShortcut } from './globalShortcuts'
import { initializeHandlers } from './handler'
import { getPetSettings, initialConfigs } from './services/config/index'
import { connectNeural, onNeuralStateChange } from './services/neural/index'
import { neuralTrigger } from './services/neural/impl/neural-http'
import { startServer } from './services/server/index'
import { runStartupSettings } from './startupSettings'
import { initializeTray, refreshTrayMenu } from './trayManager'
import { WindowManager } from './windowManager'

let isQuitting = false

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

/**
 * 应用初始化流程
 * 1. 打开 HelloWindow
 * 2. 连接 Neural Core 长连接
 * 3. 连接成功/失败后关闭 HelloWindow
 * 4. 继续正常启动（创建主窗口、启动配置等）
 */
async function initializeApp() {
  const windowManager = WindowManager.getInstance()

  // 1. 打开 HelloWindow
  windowManager.createHelloWindow()
  console.log('[Main] HelloWindow 已打开，开始初始化...')

  // 将 Neural 状态变化推送给 HelloWindow
  onNeuralStateChange((state) => {
    const helloWin = windowManager.getHelloWindow()
    if (helloWin && !helloWin.isDestroyed()) {
      helloWin.webContents.send('neural:state', { state })
    }
  })

  // 2. 连接 Neural Core
  try {
    console.log('[Main] 正在连接 Neural Core...')
    const result = await connectNeural()
    if (result.success) {
      console.log('[Main] ✓ Neural Core 连接成功')

      // 2.1 Neural 连接成功后，触发 brain.init
      try {
        console.log('[Main] ── brain.init 流程开始 ──')
        console.log('[Main] 调用 neuralTrigger: kind=command, topic=brain.init.execute')
        const initResult = await neuralTrigger({
          kind: 'command',
          topic: 'brain.init.execute',
          payload: {}
        })
        if (initResult.success) {
          console.log('[Main] ✓ brain.init 成功:', JSON.stringify(initResult.data))
        } else {
          console.warn('[Main] ✗ brain.init 失败:', initResult.msg)
        }
        console.log('[Main] ── brain.init 流程结束 ──')
      } catch (initError) {
        console.warn('[Main] ✗ brain.init 异常:', (initError as Error).message)
      }
    } else {
      console.warn('[Main] ✗ Neural Core 连接失败:', result.msg)
    }
  } catch (error) {
    console.warn('[Main] ✗ Neural Core 连接异常:', error)
  }

  // 3. 等一小段时间让用户看到连接结果
  await new Promise((resolve) => setTimeout(resolve, 5800))

  // 4. 关闭 HelloWindow
  windowManager.closeHelloWindow()
  console.log('[Main] HelloWindow 已关闭，继续启动...')

  // 5. 继续正常启动
  createWindow()
  applyStartupSettings().catch((error) => {
    console.error('[Main] 应用启动配置失败:', error)
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
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

  initializeHandlers()
  void initialConfigs()
  initializeTray()
  initialGlobalShortcut()

  // 启动初始化流程：HelloWindow → 连接 Neural → 继续启动
  initializeApp()

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

// 应用退出时注销所有全局快捷键并停止所有服务
app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', async () => {
  console.log('[Main] 应用退出，停止所有服务...')
  quitGlobalShortcut()
})
