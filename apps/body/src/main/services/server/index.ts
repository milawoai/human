import appConfig from '@config'
import serverInterfaces from '../../server/serverInterfaces.json'
import { WindowManager } from '../../windowManager'
import {
  checkIsServerSurvies,
  closeServer as closeExpressServer,
  initializeServer
} from '../../server/index'

const port = appConfig.server.port

export const startServer = async () => {
  const mainWindow = WindowManager.getMainWindow()
  await initializeServer(mainWindow, port)
  return true
}

export const stopServer = async () => {
  return await closeExpressServer()
}

export const checkServerStatus = async () => {
  return await checkIsServerSurvies(port)
}

export const getServerPort = () => {
  return port
}

export const getServerInterfaces = () => {
  return serverInterfaces
}
