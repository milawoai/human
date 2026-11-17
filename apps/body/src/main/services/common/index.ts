/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-20 21:07:43
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-02-11 19:48:30
 * @FilePath: /copy_code_desk/src/main/services/common/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import DefaultStoreHandler from '@main/store'
// import axios from 'axios'
import { globalShortcutManager } from '@main/globalShortcuts'
import { axiosRequest } from '@main/utils/request'
import type { ApiRequestParams, ApiResponse } from '@shared/types/template'
import { exec } from 'child_process'
import { clipboard } from 'electron'

export const basicTest = async () => {
  return 'Hello from common service!'
}
export const getProcessPlatform = async () => {
  return process.platform
}

export const isLinux = async () => {
  return process.platform === 'linux'
}

export const isMacOS = async () => {
  return process.platform === 'darwin'
}

export const isWindows = async () => {
  return process.platform === 'win32'
}

export const getStore = async (key) => {
  return DefaultStoreHandler.get(key)
}

export const setStore = async (key, value) => {
  DefaultStoreHandler.set(key, value)
  return {
    key,
    value
  }
}

export const deleteStore = async (key) => {
  DefaultStoreHandler.delete(key)
  return key
}

export const copyText = async (text) => {
  clipboard.writeText(text)
  return text
}

export const openCommandLine = async () => {
  const platform = process.platform

  let command
  if (platform === 'darwin') {
    command = 'open -a Terminal' // macOS
  } else if (platform === 'win32') {
    command = 'start cmd' // Windows (or 'start powershell' for PowerShell)
  } else if (platform === 'linux') {
    command = 'x-terminal-emulator' // Linux
  }

  return new Promise((resolve, reject) => {
    if (command) {
      exec(command, (error, stdout) => {
        if (error) {
          console.error(`Error opening terminal: ${error}`)
          reject(error)
        } else {
          console.log('Terminal opened')
          resolve(stdout)
        }
      })
    }
  })
}

export const executeShell = async (script) => {
  return new Promise((resolve, reject) => {
    exec(script, (error, stdout, stderr) => {
      if (error) {
        reject(error && error['message'])
        return
      }
      if (stderr) {
        reject(stderr)
        return
      }
      resolve(stdout)
    })
  })
}

export const getLocale = async () => {
  return DefaultStoreHandler.get('locale') || 'zh'
}

export const setLocale = async (locale: 'zh' | 'en') => {
  DefaultStoreHandler.set('locale', locale)
  return locale
}

export const apiRequest = async <TReq = any, TRes = any>(
  params: ApiRequestParams<TReq>
): Promise<ApiResponse<TRes>> => {
  return axiosRequest(params)
}

// 获取当前系统支持的快捷键信息
export const getGlobalShortcuts = async () => {
  try {
    const platformInfo = globalShortcutManager.getPlatformInfo()
    const result = {
      platform: platformInfo.platform,
      shortcuts: platformInfo.shortcuts,
      platformName: getPlatformDisplayName(platformInfo.platform)
    }
    return JSON.parse(JSON.stringify(result))
  } catch (error: any) {
    return {
      success: false,
      message: error.message || '获取快捷键信息失败'
    }
  }
}

// 获取平台显示名称
const getPlatformDisplayName = (platform: string): string => {
  switch (platform) {
    case 'darwin':
      return 'macOS'
    case 'win32':
      return 'Windows'
    case 'linux':
      return 'Linux'
    default:
      return '未知平台'
  }
}
