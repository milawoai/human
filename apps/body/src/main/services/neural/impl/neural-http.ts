/**
 * Neural Core HTTP 客户端
 *
 * 封装对 NestJS Neural Core HTTP 接口的调用
 */
import axios from 'axios'
import { getNeuralTarget } from './targets'

const neuralHttp = axios.create({
  baseURL: getNeuralTarget(),
  timeout: 600000,
  headers: { 'Content-Type': 'application/json' }
})

neuralHttp.interceptors.request.use(config => { config.baseURL = getNeuralTarget(); return config })

/** 触发消息 */
export const neuralTrigger = async (params: {
  kind: string
  topic: string
  payload?: any
  target?: any
}, options?: { timeoutMs: number }): Promise<any> => {
  const res = await neuralHttp.post('/trigger', params, options ? { timeout: options.timeoutMs } : undefined)
  return res.data
}

/** 查询系统状态 */
export const neuralStatus = async (): Promise<any> => {
  const res = await neuralHttp.post('/debug/status', {})
  return res.data
}

/** 查询 actors */
export const neuralListActors = async (): Promise<any> => {
  const res = await neuralHttp.post('/actors/list', {})
  return res.data
}

/** 查询 capabilities */
export const neuralListCapabilities = async (params?: {
  topic?: string
  kind?: string
}): Promise<any> => {
  const res = await neuralHttp.post('/capabilities/list', params || {})
  return res.data
}

/** 查询 subscriptions */
export const neuralListSubscriptions = async (): Promise<any> => {
  const res = await neuralHttp.post('/subscriptions/list', {})
  return res.data
}
