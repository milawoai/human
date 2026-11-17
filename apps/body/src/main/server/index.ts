/*
 * @Author: zhou shijie.zhou@renren-inc.com
 * @Date: 2024-07-02 16:53:26
 * @LastEditors: zhou shijie.zhou@renren-inc.com
 * @LastEditTime: 2026-04-16 19:51:10
 * @FilePath: /boss-desktop/src/main/server/index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import appConfig from '@config'
import express from 'express'
import { Server } from 'http'
import { v4 as generateUUID } from 'uuid'
import { setupCors } from './middleware/cors'
import { setupLogging } from './middleware/logging'
import { setupCommonRoutes } from './routes/common'
import { setupLive2DRoutes } from './routes/live2d'
import { setupMcpRoutes } from './routes/mcp'
import { setupPetRoutes } from './routes/pet'
import { serverState } from './utils/server-state'

const DEFAULT_PORT = appConfig.server.port

const createServer = async (port: number = DEFAULT_PORT) => {
  const expressApp = express()
  const registId = generateUUID()
  // 增加请求体大小限制
  expressApp.use(express.json({ limit: '50mb' })) // 设置 JSON 请求体限制为 50MB
  expressApp.use(express.urlencoded({ limit: '50mb', extended: true })) // 设置 URL 编码请求体限制

  setupLogging(expressApp)
  setupCors(expressApp)

  expressApp.post('/heart-beat', async (_, res) => {
    try {
      res.json({ success: true, serverId: registId })
    } catch (error) {
      res.status(500).json({ success: false, error: error && error['message'] })
    }
  })

  setupCommonRoutes(expressApp)
  setupLive2DRoutes(expressApp)
  setupPetRoutes(expressApp)
  setupMcpRoutes(expressApp)

  const server = expressApp.listen(port, () => {
    console.log(`Automation server is running on port ${port}`)
    serverState.setOperating(false)
  })

  return server
}

let currentServer: Server | null = null

export const checkIsServerSurvies = async (port: number = DEFAULT_PORT) => {
  if (serverState.isServerOperating()) {
    return {
      isWorking: true,
      isAlive: false
    }
  }
  await serverState.waitForServerOperation()
  if (!currentServer) {
    return {
      isAlive: false,
      isWorking: false
    }
  }
  try {
    const response = await fetch(`http://localhost:${port}/heart-beat`, {
      method: 'POST'
    })
    const data = await response.json()
    return {
      isAlive: data.success,
      isWorking: false
    }
  } catch {
    return {
      isAlive: false,
      isWorking: false
    }
  }
}

export const closeServer = async () => {
  try {
    serverState.setOperating(true)
    if (currentServer) {
      await currentServer.close()
      currentServer = null
      serverState.setOperating(false)
      return true
    }
    serverState.setOperating(false)
    return false
  } finally {
    serverState.setOperating(false)
  }
}

export const initializeServer = async (mainWindow, port: number = DEFAULT_PORT) => {
  try {
    // 发送开始初始化的通知
    await closeServer()
    serverState.setOperating(true)
    // 等待一小段时间确保端口完全释放
    await new Promise((resolve) => setTimeout(resolve, 1000))

    mainWindow?.webContents && mainWindow?.webContents.send('server-initializing')

    // 创建新服务器
    currentServer = await createServer(port)

    mainWindow?.webContents && mainWindow?.webContents.send('server-initialized', { success: true })
    serverState.setOperating(false)
    return currentServer
  } catch (error) {
    console.error('初始化服务器失败:', error)
    mainWindow?.webContents.send('server-initialized', {
      success: false,
      error: error && error['message']
    })
    throw error
  } finally {
    serverState.setOperating(false)
  }
}
