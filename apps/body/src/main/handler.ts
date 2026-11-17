/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2025-03-21 11:31:45
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2025-07-15 01:19:15
 * @FilePath: /copy_code_desk/src/main/handler.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { ipcMain } from 'electron'
import { defineHandlers } from '@shared/datas/ipc'
import type {
  ServiceModule,
  ServiceFileModule,
  HandlerConfig,
  HandlersDefinition
} from '@shared/types/ipc'
import { wrapResponse, getHandlerConfig } from '@shared/utils/ipc'

const serviceFiles: Record<string, ServiceFileModule> = import.meta.glob('./services/*/index.ts', {
  eager: true
})
const serviceModules: Record<string, ServiceModule> = {}

// 处理导入的服务模块
for (const path in serviceFiles) {
  if (Object.prototype.hasOwnProperty.call(serviceFiles, path)) {
    const serviceName = path.replace(/^\.\/services\/(.+)\/index\.ts$/, '$1')
    serviceModules[serviceName] = serviceFiles[path].default || serviceFiles[path]
  }
}

export function initializeHandlers(): void {
  Object.entries(defineHandlers as HandlersDefinition).forEach(([firstKey, handlers]) => {
    Object.entries(handlers as Record<string, HandlerConfig>).forEach(([secondKey, config]) => {
      const { servicesName, ipcName, funcName } = getHandlerConfig(firstKey, secondKey, config)

      const serviceModule = serviceModules[servicesName]
      if (!serviceModule) {
        console.error(`Service module ${servicesName} not found`)
        return
      }

      const handler = serviceModule[funcName]
      if (!handler) {
        console.error(`Handler ${funcName} not found in ${servicesName} service`)
        return
      }
      ipcMain.handle(ipcName, async (_, ...args) => {
        return wrapResponse(() => handler(...args))
      })
    })
  })
}
