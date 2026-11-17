/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-21 11:45:48
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-03-31 20:31:00
 * @FilePath: /copy_code_desk/src/shared/utils/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { BaseResponse } from '../types/ipc'
import type { HandlerConfig } from '@shared/types/ipc'

export async function wrapResponse<T>(handler: () => Promise<T> | T): Promise<BaseResponse> {
  try {
    const data = await handler()

    // 如果data已经包含success属性，则直接返回data
    if (data && typeof data === 'object' && 'success' in data) {
      return data as BaseResponse
    }

    return {
      success: true,
      data
    }
  } catch (error) {
    return {
      success: false,
      msg: (error && error['message']) || '未知错误'
    }
  }
}

export function getHandlerConfig(
  firstKey: string,
  secondKey: string,
  config: HandlerConfig
): {
  servicesName: string
  ipcName: string
  funcName: string
} {
  return {
    servicesName: config.servicesName || firstKey,
    ipcName: config.ipcName || `${firstKey}-${secondKey}`,
    funcName: config.funcName || secondKey
  }
}

export function getIpcChannel(firstKey: string, secondKey: string, config?: HandlerConfig): string {
  return config?.ipcName || `${firstKey}-${secondKey}`
}
