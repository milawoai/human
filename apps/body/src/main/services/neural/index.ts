/**
 * Neural Core 客户端服务 — 公共 API
 *
 * 其他模组通过此文件调用 Neural 功能，
 * 实现细节全部封装在 impl/ 中。
 */
import { NeuralWSClient } from './impl/neural-ws-client'
import { NeuralConnectionState } from './impl/types'

export { NeuralConnectionState }
export {
  neuralTrigger,
  neuralStatus,
  neuralListActors,
  neuralListCapabilities,
  neuralListSubscriptions
} from './impl/neural-http'

// ──────────────────────────────────────────────
// 单例管理
// ──────────────────────────────────────────────

let neuralClient: NeuralWSClient | null = null

const ensureClient = (): NeuralWSClient => {
  if (!neuralClient) {
    neuralClient = new NeuralWSClient()
  }
  return neuralClient
}

// ──────────────────────────────────────────────
// 公共 API
// ──────────────────────────────────────────────

/** 连接 Neural Core（WS 长连接 + 注册 Actor） */
export const connectNeural = async (): Promise<{ success: boolean; msg?: string }> => {
  return ensureClient().connect()
}

/** 断开 Neural Core 连接 */
export const disconnectNeural = async (): Promise<{ success: boolean; msg?: string }> => {
  if (!neuralClient) {
    return { success: true, msg: 'Not initialized' }
  }
  return neuralClient.disconnect()
}

/** 订阅 topic 事件 */
export const subscribeNeuralTopics = (
  topics: string[],
  kinds?: string[]
): { success: boolean; msg?: string } => {
  if (!neuralClient) {
    return { success: false, msg: 'Not initialized' }
  }
  return neuralClient.subscribe(topics, kinds)
}

/** 取消订阅 */
export const unsubscribeNeural = (subscriptionId: string): { success: boolean; msg?: string } => {
  if (!neuralClient) {
    return { success: false, msg: 'Not initialized' }
  }
  return neuralClient.unsubscribe(subscriptionId)
}

/** 发送总线消息（通过 WS） */
export const sendNeuralMessage = (
  kind: string,
  topic: string,
  payload: any
): { success: boolean; msg?: string } => {
  if (!neuralClient) {
    return { success: false, msg: 'Not initialized' }
  }
  return neuralClient.sendMessage(kind, topic, payload)
}

/** 获取连接状态 */
export const getNeuralState = (): {
  state: NeuralConnectionState
  isReady: boolean
} => {
  if (!neuralClient) {
    return {
      state: NeuralConnectionState.DISCONNECTED,
      isReady: false
    }
  }
  return {
    state: neuralClient.getState(),
    isReady: neuralClient.isReady()
  }
}

/** 监听连接状态变化 */
export const onNeuralStateChange = (handler: (state: NeuralConnectionState) => void): void => {
  ensureClient().onStateChange(handler)
}

/** 监听 WS 消息事件 */
export const onNeuralMessage = (event: string, handler: (data: any) => void): void => {
  ensureClient().on(event, handler)
}

/** 取消监听 WS 消息事件 */
export const offNeuralMessage = (event: string, handler?: (data: any) => void): void => {
  if (!neuralClient) return
  neuralClient.off(event, handler)
}
