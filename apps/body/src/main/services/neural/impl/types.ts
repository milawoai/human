/**
 * Neural Core 客户端类型定义
 */

/** 连接状态 */
export enum NeuralConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  REGISTERED = 'registered',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}
