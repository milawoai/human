/**
 * Neural Core WebSocket 客户端
 *
 * 管理 Socket.IO 长连接、Actor 注册、订阅、心跳
 */
import { io, Socket } from 'socket.io-client'
import { NeuralConnectionState } from './types'

// ──────────────────────────────────────────────
// 配置
// ──────────────────────────────────────────────

const NEURAL_WS_URL = 'http://localhost:12002/neural'
const HEARTBEAT_INTERVAL_MS = 30_000

const BODY_ACTOR = {
  actorId: 'body-main',
  runtime: 'electron' as const,
  system: 'body' as const,
  module: 'main'
}

// ──────────────────────────────────────────────
// NeuralWSClient
// ──────────────────────────────────────────────

export class NeuralWSClient {
  private socket: Socket | null = null
  private state: NeuralConnectionState = NeuralConnectionState.DISCONNECTED
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map()
  private stateChangeHandlers: Array<(state: NeuralConnectionState) => void> = []

  /** 连接并注册到 Neural Core */
  connect(): Promise<{ success: boolean; msg?: string }> {
    return new Promise((resolve) => {
      if (this.socket?.connected) {
        resolve({ success: true, msg: 'Already connected' })
        return
      }

      console.log('[Neural] Connecting to', NEURAL_WS_URL)
      this.updateState(NeuralConnectionState.CONNECTING)

      try {
        this.socket = io(NEURAL_WS_URL, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 3000,
          reconnectionAttempts: 10,
          timeout: 10000
        })

        this.socket.on('connect', () => {
          console.log('[Neural] WS connected, id:', this.socket?.id)
          this.updateState(NeuralConnectionState.CONNECTED)

          this.register()
            .then((result) => {
              if (result.success) {
                this.startHeartbeat()
                resolve({ success: true })
              } else {
                resolve({ success: false, msg: result.msg })
              }
            })
            .catch((err) => {
              resolve({ success: false, msg: err.message })
            })
        })

        this.socket.on('connect_error', (error) => {
          console.error('[Neural] Connection error:', error?.message)
          this.updateState(NeuralConnectionState.ERROR)
          if (this.state === NeuralConnectionState.CONNECTING) {
            resolve({ success: false, msg: error.message })
          }
        })

        this.socket.on('disconnect', (reason) => {
          console.log('[Neural] Disconnected:', reason)
          this.stopHeartbeat()
          this.updateState(NeuralConnectionState.DISCONNECTED)
        })

        this.socket.on('reconnect_attempt', (attempt) => {
          console.log('[Neural] Reconnect attempt', attempt)
          this.updateState(NeuralConnectionState.RECONNECTING)
        })

        this.socket.on('reconnect', (attempt) => {
          console.log('[Neural] Reconnected after', attempt, 'attempts')
          this.register()
        })

        this.socket.on('reconnect_failed', () => {
          console.error('[Neural] Reconnect failed')
          this.updateState(NeuralConnectionState.ERROR)
        })

        this.socket.on('message', (data) => {
          this.dispatchMessage('message', data)
        })

        this.socket.on('registered', (data) => {
          console.log('[Neural] Actor registered:', data)
          this.updateState(NeuralConnectionState.REGISTERED)
        })

        this.socket.on('subscribed', (data) => {
          console.log('[Neural] Subscribed:', data)
        })

        this.socket.on('heartbeat_ack', () => {
          // 心跳确认
        })

      } catch (error) {
        console.error('[Neural] Failed to create connection:', error)
        this.updateState(NeuralConnectionState.ERROR)
        resolve({ success: false, msg: (error as Error).message })
      }
    })
  }

  /** 断开连接 */
  async disconnect(): Promise<{ success: boolean; msg?: string }> {
    this.stopHeartbeat()

    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.updateState(NeuralConnectionState.DISCONNECTED)
    console.log('[Neural] Disconnected')
    return { success: true }
  }

  /** 订阅 topic */
  subscribe(topics: string[], kinds?: string[]): { success: boolean; msg?: string } {
    if (!this.socket?.connected) {
      return { success: false, msg: 'Not connected' }
    }

    this.socket.emit('subscribe', { topics, kinds })
    return { success: true }
  }

  /** 取消订阅 */
  unsubscribe(subscriptionId: string): { success: boolean; msg?: string } {
    if (!this.socket?.connected) {
      return { success: false, msg: 'Not connected' }
    }

    this.socket.emit('unsubscribe', { subscriptionId })
    return { success: true }
  }

  /** 发送总线消息 */
  sendMessage(kind: string, topic: string, payload: any): { success: boolean; msg?: string } {
    if (!this.socket?.connected) {
      return { success: false, msg: 'Not connected' }
    }

    this.socket.emit('message', {
      kind,
      topic,
      source: BODY_ACTOR,
      payload
    })
    return { success: true }
  }

  /** 监听消息 */
  on(event: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, new Set())
    }
    this.messageHandlers.get(event)!.add(handler)
  }

  /** 取消监听 */
  off(event: string, handler?: (data: any) => void): void {
    if (!this.messageHandlers.has(event)) return
    if (handler) {
      this.messageHandlers.get(event)!.delete(handler)
    } else {
      this.messageHandlers.delete(event)
    }
  }

  /** 获取连接状态 */
  getState(): NeuralConnectionState {
    return this.state
  }

  /** 是否已连接并注册 */
  isReady(): boolean {
    return (
      this.state === NeuralConnectionState.REGISTERED ||
      this.state === NeuralConnectionState.CONNECTED
    )
  }

  /** 监听状态变化 */
  onStateChange(handler: (state: NeuralConnectionState) => void): void {
    this.stateChangeHandlers.push(handler)
  }

  // ──────────────────────────────────────────────
  // 私有方法
  // ──────────────────────────────────────────────

  private register(): Promise<{ success: boolean; msg?: string }> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ success: false, msg: 'Socket not connected' })
        return
      }

      this.socket.emit('register', { actor: BODY_ACTOR })

      const timeout = setTimeout(() => {
        resolve({ success: false, msg: 'Register timeout' })
      }, 5000)

      this.socket.once('registered', () => {
        clearTimeout(timeout)
        this.updateState(NeuralConnectionState.REGISTERED)
        resolve({ success: true })
      })

      this.socket.once('error', (data) => {
        clearTimeout(timeout)
        resolve({ success: false, msg: data?.payload?.error || 'Register failed' })
      })
    })
  }

  private updateState(state: NeuralConnectionState): void {
    this.state = state
    this.stateChangeHandlers.forEach((handler) => handler(state))
  }

  private dispatchMessage(event: string, data: any): void {
    const handlers = this.messageHandlers.get(event)
    if (handlers) {
      handlers.forEach((handler) => handler(data))
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat')
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}
