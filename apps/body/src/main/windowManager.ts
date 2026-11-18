/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-18 12:13:17
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-05-20 15:23:11
 * @FilePath: /copy_code_desk/src/main/windowManager.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { is } from '@electron-toolkit/utils'
import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { generateUserAgent } from './utils'

interface ChildWindowOptions {
  width?: number
  height?: number
  x?: number
  y?: number
  fullscreen?: boolean
  frame?: boolean
  alwaysOnTop?: boolean
  transparent?: boolean
  resizable?: boolean
  routePath?: string
  queryParams?: Record<string, string | number>
  windowId?: string
}

interface MainWindowOptions {
  showOnReady?: boolean
}

export class WindowManager {
  private static instance: WindowManager
  private mainWindow: BrowserWindow | null = null
  private childWindows: Map<string, BrowserWindow> = new Map()
  private floatWindow: BrowserWindow | null = null
  private petWindow: BrowserWindow | null = null
  private helloWindow: BrowserWindow | null = null
  private hearingPanelWindow: BrowserWindow | null = null
  private chatPanelWindow: BrowserWindow | null = null

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): WindowManager {
    if (!WindowManager.instance) {
      WindowManager.instance = new WindowManager()
    }
    return WindowManager.instance
  }

  static getMainWindow(): BrowserWindow | null {
    if (!WindowManager.instance) {
      return null
    }
    return WindowManager.instance.getMainWindow()
  }

  createMainWindow(options: MainWindowOptions = {}): BrowserWindow {
    const { showOnReady = true } = options
    const originWindow = this.mainWindow

    this.mainWindow = new BrowserWindow({
      width: 1280,
      height: 870,
      show: false,
      autoHideMenuBar: true,
      ...(process.platform === 'linux' ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        webSecurity: false,
        sandbox: false
      }
    })

    this.setupWindowEvents(showOnReady)
    this.loadContent()

    if (originWindow) {
      originWindow.destroy()
    }

    return this.mainWindow
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow
  }

  private setupWindowEvents(showOnReady = true): void {
    if (!this.mainWindow) return

    this.mainWindow.on('ready-to-show', () => {
      if (showOnReady) {
        this.mainWindow?.show()
      }
    })

    this.mainWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // 配置 CSP：允许加载 Blob URL（开发和生产环境都适用）
    this.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders }

      // 获取现有的 CSP
      const csp =
        responseHeaders['Content-Security-Policy'] || responseHeaders['content-security-policy']

      if (csp && Array.isArray(csp)) {
        // 更新 CSP，确保包含 blob:
        const updatedCsp = csp.map((policy) => {
          // 确保 img-src 包含 blob:
          if (policy.includes('img-src')) {
            // 移除原有的 img-src 部分，添加包含 blob: 的新版本
            return policy.replace(/img-src[^;]*/, "img-src 'self' https: http: data: blob:")
          }
          return policy
        })
        responseHeaders['Content-Security-Policy'] = updatedCsp
      } else if (!csp) {
        // 如果没有 CSP，添加一个基本的（保护安全）
        responseHeaders['Content-Security-Policy'] = [
          "default-src 'self' https: http:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:"
        ]
      }

      callback({ responseHeaders })
    })
  }

  private loadContent(): void {
    if (!this.mainWindow) return

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'], {
        userAgent: generateUserAgent()
      })
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  }

  showMainWindow(routePath = '/'): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      this.createMainWindow({ showOnReady: false })
    }

    if (!this.mainWindow) return

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#${routePath}`)
    } else {
      this.mainWindow.loadFile(join(__dirname, '../../renderer/index.html'), { hash: routePath })
    }

    this.mainWindow.show()
    this.mainWindow.focus()
  }

  /** 打开模型配置窗口（human-48b）：单例，已开则聚焦 */
  openConfigWindow(): void {
    const existing = this.childWindows.get('config-window')
    if (existing && !existing.isDestroyed()) {
      existing.show()
      existing.focus()
      return
    }
    this.createChildWindow({
      windowId: 'config-window',
      width: 1040,
      height: 680,
      resizable: true,
      routePath: '/config'
    })
  }

  createChildWindow(options: ChildWindowOptions) {
    try {
      const {
        width,
        height,
        x,
        y,
        fullscreen = false,
        frame = true,
        alwaysOnTop = false,
        transparent = false,
        resizable = true,
        routePath = '',
        queryParams = {},
        windowId = `child_${Date.now()}`
      } = options

      // 如果指定窗口ID的窗口已存在，先关闭
      if (this.childWindows.has(windowId)) {
        this.closeChildWindow(windowId)
      }

      // 获取屏幕尺寸作为默认值
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

      // 创建子窗口
      const childWindow = new BrowserWindow({
        width: width || Math.floor(screenWidth * 0.8),
        height: height || Math.floor(screenHeight * 0.8),
        x: x ?? undefined,
        y: y ?? undefined,
        fullscreen,
        frame,
        alwaysOnTop,
        transparent,
        show: false,
        autoHideMenuBar: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          webSecurity: false,
          sandbox: false
        }
      })

      // 设置窗口可调整大小属性
      childWindow.setResizable(resizable)

      // 构建URL参数
      let urlWithParams = ''
      if (routePath || Object.keys(queryParams).length > 0) {
        const params = new URLSearchParams()
        Object.entries(queryParams).forEach(([key, value]) => {
          params.set(key, String(value))
        })
        const query = params.toString()

        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          // 开发环境 - 使用 hash 路由
          const baseUrl = process.env['ELECTRON_RENDERER_URL']
          const hashPath = routePath ? `/#${routePath}` : '/#/'
          urlWithParams = query ? `${baseUrl}${hashPath}?${query}` : `${baseUrl}${hashPath}`
        } else {
          // 生产环境
          const hashPath = routePath || '/'
          const hash = query ? `${hashPath}?${query}` : hashPath
          childWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash })
          urlWithParams = '' // 在生产环境中不需要构建完整URL
        }
      }

      // 加载内容
      if (urlWithParams && is.dev) {
        childWindow.loadURL(urlWithParams)
      } else if (!urlWithParams) {
        if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
          childWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
        } else {
          childWindow.loadFile(join(__dirname, '../renderer/index.html'))
        }
      }

      // 窗口事件处理
      childWindow.on('ready-to-show', () => {
        childWindow.show()
      })

      childWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      childWindow.on('closed', () => {
        this.childWindows.delete(windowId)
      })

      // 存储窗口引用
      this.childWindows.set(windowId, childWindow)

      return { success: true, windowId, window: childWindow }
    } catch (error) {
      console.error('创建子窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  closeChildWindow(windowId: string) {
    try {
      const childWindow = this.childWindows.get(windowId)
      if (childWindow && !childWindow.isDestroyed()) {
        childWindow.close()
        this.childWindows.delete(windowId)
        return { success: true }
      }
      return { success: false, msg: '窗口不存在或已关闭' }
    } catch (error) {
      console.error('关闭子窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  getChildWindow(windowId: string): BrowserWindow | null {
    return this.childWindows.get(windowId) || null
  }

  getAllChildWindows(): Map<string, BrowserWindow> {
    return new Map(this.childWindows)
  }

  closeAllChildWindows() {
    try {
      this.childWindows.forEach((window, windowId) => {
        if (!window.isDestroyed()) {
          window.close()
        }
        this.childWindows.delete(windowId)
      })
      return { success: true }
    } catch (error) {
      console.error('关闭所有子窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  createFloatWindow() {
    try {
      // 关闭之前的悬浮窗口
      if (this.floatWindow && !this.floatWindow.isDestroyed()) {
        this.floatWindow.close()
        this.floatWindow = null
      }

      // 获取屏幕尺寸
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

      // 创建悬浮窗口
      this.floatWindow = new BrowserWindow({
        width: Math.floor(screenWidth * 0.5),
        height: Math.floor(screenHeight * 0.6),
        x: Math.floor((screenWidth - 400) / 2), // 居中显示
        y: 50, // 距离顶部50像素
        frame: false, // 无边框
        alwaysOnTop: true, // 总是在最前
        transparent: false,
        resizable: true,
        show: false,
        autoHideMenuBar: true,
        skipTaskbar: true, // 不在任务栏显示
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          webSecurity: false,
          sandbox: false
        }
      })

      // 加载悬浮窗口页面
      const routePath = '/float-window'
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const baseUrl = process.env['ELECTRON_RENDERER_URL']
        const urlWithRoute = `${baseUrl}/#${routePath}`
        this.floatWindow.loadURL(urlWithRoute)
      } else {
        this.floatWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: routePath })
      }

      // 窗口事件处理
      this.floatWindow.on('ready-to-show', () => {
        this.floatWindow?.show()
      })

      this.floatWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      this.floatWindow.on('closed', () => {
        this.floatWindow = null
      })
      // this.floatWindow?.webContents.openDevTools() // 临时注释
      return { success: true, message: '悬浮窗口创建成功' }
    } catch (error) {
      console.error('创建悬浮窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  closeFloatWindow() {
    try {
      if (this.floatWindow && !this.floatWindow.isDestroyed()) {
        this.floatWindow.close()
        this.floatWindow = null
        return { success: true, message: '悬浮窗口关闭成功' }
      }
      return { success: false, msg: '悬浮窗口不存在或已关闭' }
    } catch (error) {
      console.error('关闭悬浮窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  getFloatWindow(): BrowserWindow | null {
    return this.floatWindow
  }

  createHelloWindow() {
    try {
      if (this.helloWindow && !this.helloWindow.isDestroyed()) {
        this.helloWindow.show()
        return { success: true, message: 'HelloWindow已显示' }
      }

      const primaryDisplay = screen.getPrimaryDisplay()
      const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
      const width = 480
      const height = 320

      this.helloWindow = new BrowserWindow({
        backgroundColor: '#00000000',
        width,
        height,
        x: Math.round((screenWidth - width) / 2),
        y: Math.round((screenHeight - height) / 2),
        frame: false,
        transparent: true,
        resizable: false,
        show: false,
        autoHideMenuBar: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          webSecurity: false,
          sandbox: false
        }
      })

      const helloWindow = this.helloWindow
      helloWindow.once('ready-to-show', () => {
        if (!helloWindow.isDestroyed()) helloWindow.show()
      })
      helloWindow.once('closed', () => {
        if (this.helloWindow === helloWindow) this.helloWindow = null
      })
      const routePath = '/hello'
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        void helloWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#${routePath}`).catch(error => console.error('HelloWindow加载失败:', error.message))
      } else {
        void helloWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: routePath }).catch(error => console.error('HelloWindow加载失败:', error.message))
      }

      return { success: true, message: 'HelloWindow创建成功' }
    } catch (error) {
      console.error('创建HelloWindow失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  closeHelloWindow() {
    try {
      if (this.helloWindow && !this.helloWindow.isDestroyed()) {
        this.helloWindow.close()
        this.helloWindow = null
        return { success: true, message: 'HelloWindow已关闭' }
      }
      return { success: true, message: 'HelloWindow未打开' }
    } catch (error) {
      console.error('关闭HelloWindow失败:', error)
      return { success: false, msg: error instanceof Error ? error.message : String(error) }
    }
  }

  getHelloWindow(): BrowserWindow | null {
    return this.helloWindow
  }

  createPetWindow() {
    try {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.show()
        return { success: true, message: 'Pet窗口已显示', visible: true }
      }

      const primaryDisplay = screen.getPrimaryDisplay()
      const { x: screenX, y: screenY, width: screenWidth } = primaryDisplay.workArea
      const width = 300
      const height = 440

      this.petWindow = new BrowserWindow({
        width,
        height,
        x: screenX + screenWidth - width - 40,
        y: screenY + 80,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        backgroundColor: 'rgba(255, 255, 255, 0)',
        hasShadow: false,
        resizable: false,
        show: false,
        autoHideMenuBar: true,
        skipTaskbar: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          webSecurity: false,
          sandbox: false
        }
      })

      this.petWindow.setAlwaysOnTop(true, 'screen-saver')

      const routePath = '/pet'
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        this.petWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#${routePath}`)
      } else {
        this.petWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: routePath })
      }

      const showPetWindow = () => {
        if (!this.petWindow || this.petWindow.isDestroyed()) return
        this.petWindow.show()
      }

      this.petWindow.on('ready-to-show', showPetWindow)
      this.petWindow.webContents.once('did-finish-load', showPetWindow)

      this.petWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      this.petWindow.on('closed', () => {
        this.petWindow = null
      })

      return { success: true, message: 'Pet窗口创建成功', visible: true }
    } catch (error) {
      console.error('创建Pet窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  closePetWindow() {
    try {
      if (this.petWindow && !this.petWindow.isDestroyed()) {
        this.petWindow.close()
        this.petWindow = null
        return { success: true, message: 'Pet窗口已关闭', visible: false }
      }
      return { success: true, message: 'Pet窗口未打开', visible: false }
    } catch (error) {
      console.error('关闭Pet窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  togglePetWindow() {
    if (this.petWindow && !this.petWindow.isDestroyed() && this.petWindow.isVisible()) {
      return this.closePetWindow()
    }

    return this.createPetWindow()
  }

  setPetIgnoreMouseEvents(ignore: boolean) {
    try {
      if (!this.petWindow || this.petWindow.isDestroyed()) {
        return { success: false, msg: 'Pet窗口不存在' }
      }

      if (process.platform === 'darwin') {
        this.petWindow.setIgnoreMouseEvents(ignore)
      } else {
        this.petWindow.setIgnoreMouseEvents(ignore, { forward: true })
      }

      return { success: true, message: ignore ? '已开启鼠标穿透' : '已关闭鼠标穿透', ignore }
    } catch (error) {
      console.error('设置Pet窗口鼠标穿透失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  resizePetWindow(width: number, height: number) {
    try {
      if (!this.petWindow || this.petWindow.isDestroyed()) {
        return { success: false, msg: 'Pet窗口不存在' }
      }

      const targetWidth = Math.round(width)
      const targetHeight = Math.round(height)
      if (targetWidth <= 0 || targetHeight <= 0) {
        return { success: false, msg: 'Pet窗口尺寸无效' }
      }

      const bounds = this.petWindow.getBounds()
      const centerX = bounds.x + bounds.width / 2
      const centerY = bounds.y + bounds.height / 2
      const display = screen.getDisplayMatching(bounds)
      const workArea = display.workArea
      const nextX = Math.min(
        workArea.x + workArea.width - targetWidth,
        Math.max(workArea.x, Math.round(centerX - targetWidth / 2))
      )
      const nextY = Math.min(
        workArea.y + workArea.height - targetHeight,
        Math.max(workArea.y, Math.round(centerY - targetHeight / 2))
      )

      this.petWindow.setBounds({
        x: nextX,
        y: nextY,
        width: targetWidth,
        height: targetHeight
      })

      return {
        success: true,
        message: 'Pet窗口尺寸已更新',
        data: this.petWindow.getBounds()
      }
    } catch (error) {
      console.error('调整Pet窗口尺寸失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  movePetWindowBy(deltaX: number, deltaY: number) {
    try {
      if (!this.petWindow || this.petWindow.isDestroyed()) {
        return { success: false, msg: 'Pet窗口不存在' }
      }

      const bounds = this.petWindow.getBounds()
      this.petWindow.setBounds({
        x: Math.round(bounds.x + deltaX),
        y: Math.round(bounds.y + deltaY),
        width: bounds.width,
        height: bounds.height
      })

      return {
        success: true,
        message: 'Pet窗口位置已更新',
        data: this.petWindow.getBounds()
      }
    } catch (error) {
      console.error('移动Pet窗口失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  getPetCursorPosition() {
    try {
      if (!this.petWindow || this.petWindow.isDestroyed()) {
        return { success: false, msg: 'Pet窗口不存在' }
      }

      const cursor = screen.getCursorScreenPoint()
      const bounds = this.petWindow.getBounds()
      const x = cursor.x - bounds.x
      const y = cursor.y - bounds.y

      return {
        success: true,
        data: {
          x,
          y,
          isInside: x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height,
          bounds
        }
      }
    } catch (error) {
      console.error('获取Pet窗口鼠标位置失败:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, msg: errorMessage }
    }
  }

  getPetWindow(): BrowserWindow | null {
    return this.petWindow
  }

  // ──────────────────────────────────────────────
  // Hearing Panel 窗口
  // ──────────────────────────────────────────────

  createHearingPanelWindow() {
    try {
      if (this.hearingPanelWindow && !this.hearingPanelWindow.isDestroyed()) {
        this.hearingPanelWindow.show()
        return { success: true, message: 'HearingPanel 已显示' }
      }

      const panelWidth = 480
      const panelHeight = 480
      const position = this.calcBestPosition(panelWidth, panelHeight)

      this.hearingPanelWindow = new BrowserWindow({
        width: panelWidth,
        height: panelHeight,
        x: position.x,
        y: position.y,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: true,
        minWidth: 480,
        minHeight: 420,
        show: false,
        autoHideMenuBar: true,
        skipTaskbar: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          webSecurity: false,
          sandbox: false
        }
      })

      const routePath = '/hearing-panel'
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        this.hearingPanelWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#${routePath}`)
      } else {
        this.hearingPanelWindow.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: routePath
        })
      }

      this.hearingPanelWindow.on('ready-to-show', () => {
        this.hearingPanelWindow?.show()
      })

      this.hearingPanelWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      this.hearingPanelWindow.on('closed', () => {
        this.hearingPanelWindow = null
      })

      return { success: true, message: 'HearingPanel 创建成功' }
    } catch (error) {
      console.error('创建 HearingPanel 失败:', error)
      return { success: false, msg: error instanceof Error ? error.message : String(error) }
    }
  }

  closeHearingPanelWindow() {
    try {
      if (this.hearingPanelWindow && !this.hearingPanelWindow.isDestroyed()) {
        this.hearingPanelWindow.close()
        this.hearingPanelWindow = null
        return { success: true, message: 'HearingPanel 已关闭' }
      }
      return { success: true, message: 'HearingPanel 未打开' }
    } catch (error) {
      console.error('关闭 HearingPanel 失败:', error)
      return { success: false, msg: error instanceof Error ? error.message : String(error) }
    }
  }

  getHearingPanelWindow(): BrowserWindow | null {
    return this.hearingPanelWindow
  }

  createChatPanelWindow() {
    try {
      if (this.chatPanelWindow && !this.chatPanelWindow.isDestroyed()) {
        this.chatPanelWindow.show()
        this.chatPanelWindow.focus()
        return { success: true, message: 'ChatPanel 已显示' }
      }

      const panelWidth = 520
      const panelHeight = 620
      const position = this.calcBestPosition(panelWidth, panelHeight)

      this.chatPanelWindow = new BrowserWindow({
        width: panelWidth,
        height: panelHeight,
        x: position.x,
        y: position.y,
        frame: false,
        alwaysOnTop: true,
        transparent: true,
        resizable: true,
        minWidth: 460,
        minHeight: 500,
        show: false,
        autoHideMenuBar: true,
        skipTaskbar: true,
        ...(process.platform === 'linux' ? { icon } : {}),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          webSecurity: false,
          sandbox: false
        }
      })

      const routePath = '/chat-panel'
      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        this.chatPanelWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#${routePath}`)
      } else {
        this.chatPanelWindow.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: routePath
        })
      }

      this.chatPanelWindow.on('ready-to-show', () => {
        this.chatPanelWindow?.show()
      })

      this.chatPanelWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      this.chatPanelWindow.on('closed', () => {
        this.chatPanelWindow = null
      })

      return { success: true, message: 'ChatPanel 创建成功' }
    } catch (error) {
      console.error('创建 ChatPanel 失败:', error)
      return { success: false, msg: error instanceof Error ? error.message : String(error) }
    }
  }

  closeChatPanelWindow() {
    try {
      if (this.chatPanelWindow && !this.chatPanelWindow.isDestroyed()) {
        this.chatPanelWindow.close()
        this.chatPanelWindow = null
        return { success: true, message: 'ChatPanel 已关闭' }
      }
      return { success: true, message: 'ChatPanel 未打开' }
    } catch (error) {
      console.error('关闭 ChatPanel 失败:', error)
      return { success: false, msg: error instanceof Error ? error.message : String(error) }
    }
  }

  getChatPanelWindow(): BrowserWindow | null {
    return this.chatPanelWindow
  }

  /**
   * 根据 Pet 窗口位置，按 右→下→左→上 优先级计算 HearingPanel 最佳位置
   */
  private calcBestPosition(panelWidth: number, panelHeight: number): { x: number; y: number } {
    // 如果没有 Pet 窗口，回退到屏幕右侧居中
    if (!this.petWindow || this.petWindow.isDestroyed()) {
      const display = screen.getPrimaryDisplay()
      const wa = display.workArea
      return {
        x: wa.x + wa.width - panelWidth - 40,
        y: wa.y + Math.round((wa.height - panelHeight) / 2)
      }
    }

    const petBounds = this.petWindow.getBounds()
    const display = screen.getDisplayMatching(petBounds)
    const wa = display.workArea
    const gap = 8

    const candidates = [
      // 1. 右侧
      { x: petBounds.x + petBounds.width + gap, y: petBounds.y },
      // 2. 下方
      { x: petBounds.x, y: petBounds.y + petBounds.height + gap },
      // 3. 左侧
      { x: petBounds.x - panelWidth - gap, y: petBounds.y },
      // 4. 上方
      { x: petBounds.x, y: petBounds.y - panelHeight - gap }
    ]

    for (const pos of candidates) {
      const fitsInWorkArea =
        pos.x >= wa.x &&
        pos.y >= wa.y &&
        pos.x + panelWidth <= wa.x + wa.width &&
        pos.y + panelHeight <= wa.y + wa.height
      if (fitsInWorkArea) {
        return pos
      }
    }

    // 全部放不下，选右方向并 clamp 到 workArea 内
    return {
      x: Math.max(wa.x, Math.min(wa.x + wa.width - panelWidth, petBounds.x + petBounds.width + gap)),
      y: Math.max(wa.y, Math.min(wa.y + wa.height - panelHeight, petBounds.y))
    }
  }
}
