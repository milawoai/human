import { BrowserWindow, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import { io } from 'socket.io-client'
import { neuralTrigger } from '../neural/impl/neural-http'
import { executeAgentRun } from './bridge'
import { unwrapAgentResponse } from '../../../shared/agent-panel'
import type { AgentRunInput } from '../../../shared/agent-panel'

let panel: BrowserWindow | null = null
let running = false

const failure = (error: unknown) => ({ success: false, msg: error instanceof Error ? error.message : String(error) })

export async function openPanel() {
  if (panel && !panel.isDestroyed()) {
    panel.show()
    panel.focus()
    return { success: true }
  }
  const window = new BrowserWindow({
    title: 'Human · Agent 测试', width: 900, height: 760, minWidth: 640, minHeight: 560,
    show: false, autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  panel = window
  window.on('close', (event) => {
    if (running) {
      event.preventDefault()
      window.hide()
    }
  })
  window.on('closed', () => { if (panel === window) panel = null })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.once('ready-to-show', () => window.show())
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/#/agent-panel`)
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/agent-panel' })
  }
  return { success: true }
}

/** One short-lived observer per run, independent of hearing's shared Body actor. */
async function observe(receive: (message: any) => void): Promise<() => void> {
  const socket = io('http://localhost:12002/neural', { transports: ['websocket'], reconnection: false, autoConnect: false })
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const cleanup = () => {
    clearInterval(heartbeat)
    socket.removeAllListeners()
    socket.disconnect()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('Agent 事件订阅超时，请确认后端已启动')), 8000)
    const fail = (error: Error) => { clearTimeout(timer); cleanup(); reject(error) }
    socket.once('connect_error', fail)
    socket.once('error', (data) => fail(new Error(data?.payload?.error || 'Agent 事件订阅失败')))
    socket.on('connect', () => socket.emit('register', {
      actor: { actorId: `body-agent-${crypto.randomUUID()}`, runtime: 'electron', system: 'body', module: 'agent-test' }
    }))
    socket.once('registered', () => socket.emit('subscribe', { topics: ['brain.agent.run.event'], kinds: ['event'] }))
    socket.once('subscribed', (data) => {
      if (!data?.success) return fail(new Error('Agent 事件订阅失败'))
      clearTimeout(timer)
      heartbeat = setInterval(() => socket.emit('heartbeat'), 30_000)
      resolve(cleanup)
    })
    socket.on('message', receive)
    socket.on('disconnect', () => {
      clearInterval(heartbeat)
      if (running && panel && !panel.isDestroyed()) panel.webContents.send('agent:notice', '事件连接已断开；等待执行结果，完成后会重新读取会话。')
    })
    socket.connect()
  })
}

export async function run(input: AgentRunInput) {
  if (running) return { success: false, msg: '已有 Agent 任务运行中，请等待完成' }
  running = true
  const owner = panel
  try {
    const data = await executeAgentRun(input, {
      observe, trigger: neuralTrigger,
      emit: (payload) => { if (owner && !owner.isDestroyed()) owner.webContents.send('agent:event', payload) }
    })
    return { success: true, data }
  } catch (error) {
    return failure(error)
  } finally {
    running = false
  }
}

export async function listSessions() {
  try {
    return { success: true, data: unwrapAgentResponse(await neuralTrigger({ kind: 'query', topic: 'brain.agent.session.list', payload: { limit: 50 } })) }
  } catch (error) { return failure(error) }
}

export async function getSession(input: { sessionId: string }) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input?.sessionId || '')) return { success: false, msg: '会话 ID 不合法' }
  try {
    return { success: true, data: unwrapAgentResponse(await neuralTrigger({ kind: 'query', topic: 'brain.agent.session.get', payload: { sessionId: input.sessionId, includeMessages: true } }), true) }
  } catch (error) { return failure(error) }
}

export async function getRun(input: { sessionId: string; runId?: string }) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input?.sessionId || '')) return failure('会话 ID 不合法')
  try {
    return { success: true, data: unwrapAgentResponse(await neuralTrigger({ kind: 'query', topic: 'brain.agent.run.get', payload: input }, { timeoutMs: 8000 })) }
  } catch (error) { return failure(error) }
}

export async function cancelRun(input: { sessionId: string; runId: string }) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input?.sessionId || '') || !/^[a-zA-Z0-9_-]{1,128}$/.test(input?.runId || '')) return failure('会话或运行 ID 不合法')
  try {
    return { success: true, data: unwrapAgentResponse(await neuralTrigger({ kind: 'command', topic: 'brain.agent.run.cancel', payload: input }, { timeoutMs: 8000 })) }
  } catch (error) { return failure(error) }
}
