/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-21 15:11:03
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-01-22 17:12:06
 * @FilePath: /copy_code_desk/src/renderer/src/plugin/ipc.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { showFail, showSuccess } from '@renderer/composables/useCustomToast'
import { defineHandlers } from '@shared/datas/ipc'
import { BaseResponse } from '@shared/types/ipc'
import { getIpcChannel } from '@shared/utils/ipc'
import { App, InjectionKey, Plugin } from 'vue'

// 导入全局 loading 状态
let globalLoadingState: any = null
let globalLoadingText: any = null

// 延迟导入全局 loading 状态
setTimeout(() => {
  try {
    import('@renderer/composables/useGlobalUI').then(({ useGlobalUI }) => {
      const { isGlobalLoading, loadingText } = useGlobalUI()
      globalLoadingState = isGlobalLoading
      globalLoadingText = loadingText
    })
  } catch (error) {
    console.warn('Failed to import global loading state: ', error)
  }
}, 0)
// ==== type ====
// === private ===
type IpcFunction = (...args: any[]) => Promise<BaseResponse>

// 特殊的 apiRequest 函数类型，支持泛型
type ApiRequestFunction = <TReq = any, TRes = any>(
  params: import('@shared/types/template').ApiRequestParams<TReq>
) => Promise<import('@shared/types/template').ApiResponse<TRes>>

// IPC 服务类型
export type IpcService = Record<string, IpcFunction>

// 扩展 common 服务类型，添加 apiRequest
export type CommonService = IpcService & {
  apiRequest: ApiRequestFunction
}

// IPC 代理类型
export type IpcProxy = Record<string, IpcService> & {
  common: CommonService
}

// 创建注入键（Symbol 类型的键可以确保唯一性）
export const IPC_INJECTION_KEY = Symbol('ipc') as InjectionKey<IpcProxy>

interface HooksConfig {
  beforeInvoke?: (params?: any) => void
  afterInvoke?: (result?: any) => void
  errorHandler?: (error: any) => void
}

interface InvokeOptions {
  useHooks: boolean
  hookType?: string
  customHooks?: HooksConfig
}

let vueApp: App | null = null

// === public ===
// 插件配置接口
export interface IpcPluginOptions {
  defaultHookType?: string // 改为 string
  customPresetHooks?: Record<string, HooksConfig>
}

const PRESET_HOOKS: Record<string, HooksConfig> = {
  loading: {
    beforeInvoke: () => {
      if (globalLoadingState && globalLoadingText) {
        globalLoadingText.value = '处理中...'
        globalLoadingState.value = true
      }
    },
    afterInvoke: () => {
      if (globalLoadingState) {
        globalLoadingState.value = false
      }
    },
    errorHandler: (error) => {
      if (globalLoadingState) {
        globalLoadingState.value = false
      }
      showFail(error?.message || 'API 调用失败')
    }
  },
  message: {
    beforeInvoke: (params) => {
      console.log('开始调用: ', params)
    },
    afterInvoke: (result) => {
      console.log('调用完成: ', result)
      if (result?.success) {
        showSuccess(result.message || '操作成功')
      }
    },
    errorHandler: (error) => {
      showFail(error?.message || '操作失败')
    }
  },
  log: {
    beforeInvoke: () => {
      console.log('开始调用')
    },
    afterInvoke: () => {
      console.log('调用完成')
    },
    errorHandler: (error) => {
      console.log(error)
      // ElMessage.error(error.message || '操作失败')
    }
  },
  silent: {
    // 静默模式，不执行任何钩子
  },
  confirmDialog: {
    beforeInvoke: () => {
      document.body.style.cursor = 'wait'
    },
    afterInvoke: (result) => {
      document.body.style.cursor = 'default'
      // 获取全局的 Vue 实例
      if (!result || !result.success) {
        throw new Error(JSON.stringify(result))
      }
      if (!vueApp) {
        console.error('Vue app instance not found')
        return
      }
      const resultData = result.data || {}
      let resultString = ''
      if (typeof resultData === 'string') {
        resultString = resultData
      } else if (typeof resultData === 'object') {
        resultString = JSON.stringify(resultData, null, 2)
      }
      vueApp?.config.globalProperties.$confirm.close()
      vueApp?.config.globalProperties.$confirm.require({
        message: resultString,
        header: '数据预览',
        icon: 'pi pi-info-circle',
        acceptLabel: '复制',
        rejectLabel: '取消',
        accept: () => {
          navigator.clipboard
            .writeText(resultString)
            .then(() => {
              console.log('复制成功')
            })
            .catch((err) => {
              console.error('复制失败:', err)
            })
        }
      })
    },
    errorHandler: (error) => {
      if (!vueApp) {
        console.error('Vue app instance not found')
        return
      }

      vueApp?.config.globalProperties.$confirm.require({
        message: error.message || '操作失败',
        header: '错误',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: '确定'
        //rejectVisible: false
      })
    }
  }
}

// ==== function ====

function createIpcHandler(
  firstKey: string,
  secondKey: string,
  config: any,
  pluginOptions?: IpcPluginOptions
): IpcFunction {
  return async (...args: any[]): Promise<BaseResponse> => {
    // 检查最后一个参数是否为 InvokeOptions
    const lastArg = args.length > 0 ? args[args.length - 1] : null
    const isInvokeOptions =
      lastArg &&
      typeof lastArg === 'object' &&
      ('useHooks' in lastArg || 'hookType' in lastArg || 'customHooks' in lastArg)

    // 提取调用选项，如果最后一个参数是 InvokeOptions，则从参数列表中移除
    const invokeOptions: InvokeOptions = isInvokeOptions ? args.pop() : {}

    // 确定要使用的钩子配置
    const hookType = invokeOptions.hookType || pluginOptions?.defaultHookType || 'silent'
    const hooks = invokeOptions.customHooks || PRESET_HOOKS[hookType] || PRESET_HOOKS.silent

    try {
      const channel = getIpcChannel(firstKey, secondKey, config)
      const processedArgs = (args || []).map((arg) => unwrapProxy(arg))
      // 执行前置钩子
      if (invokeOptions.useHooks) {
        hooks.beforeInvoke?.({
          channel,
          ...(processedArgs || [])
        })
      }
      // 确保 args 是数组，即使是空的
      const result = await window.electron.ipcRenderer.invoke(channel, ...(processedArgs || []))
      // 执行后置钩子
      if (invokeOptions.useHooks !== false) {
        hooks.afterInvoke?.(result)
      }

      return result
    } catch (error) {
      // 执行错误钩子
      if (invokeOptions.useHooks !== false) {
        hooks.errorHandler?.(error)
      }
      return {
        success: false,
        msg: (error && error['message']) || '调用失败'
      }
    }
  }
}

export const createIpcPlugin = (options?: IpcPluginOptions): Plugin => {
  // 合并自定义预设钩子
  if (options?.customPresetHooks) {
    Object.assign(PRESET_HOOKS, options.customPresetHooks)
  }

  const ipcPlugin: Plugin = {
    install(app: App) {
      // 创建代理对象
      const ipcProxy = Object.entries(defineHandlers).reduce(
        (proxy, [firstKey, handlers]) => {
          proxy[firstKey] = Object.entries(handlers).reduce(
            (services, [secondKey, config]) => {
              services[secondKey] = createIpcHandler(firstKey, secondKey, config, options)
              return services
            },
            {} as Record<string, IpcFunction>
          )
          return proxy
        },
        {} as Record<string, Record<string, IpcFunction>>
      )
      vueApp = app
      // 通过全局属性提供
      app.config.globalProperties.$ipc = ipcProxy

      // 通过 provide/inject 提供
      app.provide('ipc', ipcProxy)

      // 可选：提供钩子配置，以便其他地方使用
      app.provide('ipcHooks', PRESET_HOOKS)

      // 可选：注册一个全局方法来动态添加新的钩子类型
      app.config.globalProperties.$registerIpcHook = (type: string, hooks: HooksConfig) => {
        PRESET_HOOKS[type] = hooks
      }

      // 可选：开发环境下的调试信息
      if (import.meta.env.DEV) {
        console.log('IPC Plugin Initialized with handlers:', Object.keys(ipcProxy))
        console.log('Available hook types:', Object.keys(PRESET_HOOKS))
      }
    }
  }

  return ipcPlugin
}

function unwrapProxy(obj: any): any {
  // 处理基本类型
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map((item) => unwrapProxy(item))
  }

  // 处理 Vue 的 Proxy 对象
  if (obj?.__v_raw) {
    return unwrapProxy(obj.__v_raw)
  }

  // 处理普通对象
  const result: Record<string, any> = {}
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = unwrapProxy(obj[key])
    }
  }
  return result
}

export interface IpcInjection {
  ipc: IpcProxy
}
// 声明模块扩展 Vue 的类型
declare module '@vue/runtime-core' {
  export interface ComponentCustomProperties {
    $ipc: Record<string, Record<string, IpcFunction>>
    $registerIpcHook: (type: string, hooks: HooksConfig) => void
  }
}
