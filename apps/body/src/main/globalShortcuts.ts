/*
 * 全局快捷键管理器
 * 支持跨平台快捷键注册和管理
 */
import { globalShortcut } from 'electron'

export interface ShortcutDefinition {
  key: string
  description: string
  handler: () => Promise<void> | void
}

interface PlatformShortcuts {
  darwin: string // macOS
  win32: string // Windows
  linux: string // Linux
}

export class GlobalShortcutManager {
  private static instance: GlobalShortcutManager
  private registeredShortcuts: Map<string, ShortcutDefinition> = new Map()

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): GlobalShortcutManager {
    if (!GlobalShortcutManager.instance) {
      GlobalShortcutManager.instance = new GlobalShortcutManager()
    }
    return GlobalShortcutManager.instance
  }

  /**
   * 根据平台获取对应的快捷键
   */
  private getPlatformShortcut(shortcuts: PlatformShortcuts): string {
    const platform = process.platform
    return shortcuts[platform] || shortcuts.darwin // 默认使用 macOS 的快捷键
  }

  /**
   * 注册单个快捷键
   */
  registerShortcut(
    shortcuts: PlatformShortcuts | string,
    description: string,
    handler: () => Promise<void> | void
  ): boolean {
    const shortcutKey =
      typeof shortcuts === 'string' ? shortcuts : this.getPlatformShortcut(shortcuts)

    const success = globalShortcut.register(shortcutKey, async () => {
      console.log(`Global shortcut triggered: ${shortcutKey}`)
      try {
        await handler()
      } catch (error) {
        console.error(`Failed to execute shortcut handler for ${shortcutKey}:`, error)
      }
    })

    if (success) {
      this.registeredShortcuts.set(shortcutKey, {
        key: shortcutKey,
        description,
        handler
      })
      console.log(`Global shortcut registered: ${shortcutKey} - ${description}`)
    } else {
      console.error(`Failed to register global shortcut: ${shortcutKey}`)
    }

    return success
  }

  /**
   * 注册所有默认快捷键
   */
  registerDefaultShortcuts(): void {
    // 显示悬浮窗口快捷键
    this.registerShortcut(
      {
        darwin: 'Option+Command+6', // macOS: Option + Command + 6
        win32: 'Alt+Ctrl+6', // Windows: Alt + Ctrl + 6
        linux: 'Alt+Ctrl+6' // Linux: Alt + Ctrl + 6
      },
      '显示Obsidian悬浮窗口',
      async () => {
        // await showObsidianWindow()
      }
    )

    // 可以在这里添加更多默认快捷键
    // this.registerShortcut(
    //   {
    //     darwin: 'Option+Command+7',
    //     win32: 'Alt+Ctrl+7',
    //     linux: 'Alt+Ctrl+7'
    //   },
    //   '其他功能',
    //   otherHandler
    // )
  }

  /**
   * 注销指定快捷键
   */
  unregisterShortcut(shortcutKey: string): void {
    if (this.registeredShortcuts.has(shortcutKey)) {
      globalShortcut.unregister(shortcutKey)
      this.registeredShortcuts.delete(shortcutKey)
      console.log(`Global shortcut unregistered: ${shortcutKey}`)
    }
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registeredShortcuts.clear()
    console.log('All global shortcuts unregistered')
  }

  /**
   * 获取已注册的快捷键列表
   */
  getRegisteredShortcuts(): ShortcutDefinition[] {
    return Array.from(this.registeredShortcuts.values())
  }

  /**
   * 检查快捷键是否已注册
   */
  isRegistered(shortcutKey: string): boolean {
    return globalShortcut.isRegistered(shortcutKey)
  }

  /**
   * 获取当前平台信息
   */
  getPlatformInfo(): { platform: string; shortcuts: ShortcutDefinition[] } {
    return {
      platform: process.platform,
      shortcuts: this.getRegisteredShortcuts()
    }
  }
}

// 导出单例实例
export const globalShortcutManager = GlobalShortcutManager.getInstance()

export const initialGlobalShortcut = () => {
  // 注册所有全局快捷键
  globalShortcutManager.registerDefaultShortcuts()
}

export const quitGlobalShortcut = () => {
  // 注册所有全局快捷键
  globalShortcutManager.unregisterAll()
}
