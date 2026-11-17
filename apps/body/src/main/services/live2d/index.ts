import { randomUUID } from 'crypto'
import { ipcMain } from 'electron'
import {
  parseLive2DPerformancePayload,
  type Live2DPerformancePayload
} from '@shared/live2dPerformance'
import { getLive2DPetModelsResponse } from '@shared/live2dPetModels'
import { WindowManager } from '../../windowManager'
import { neuralTrigger } from '../neural/impl/neural-http'
import { requestTtsSynthesis } from './tts'
import { SpeechPlaybackGate } from '../../../shared/speech-playback'
import type { SpeechPlaybackTicket } from '../../../shared/speech-playback'

const speechPlaybackGate = new SpeechPlaybackGate()
export const setSpeechPlaybackState = async (ticket: SpeechPlaybackTicket) => {
  try { speechPlaybackGate.set(ticket); return { success: true } }
  catch (error) { return { success: false, msg: String(error) } }
}
export const isSpeechPlaybackCurrent = async (ticket: SpeechPlaybackTicket) => ({ success: true, data: { current: speechPlaybackGate.current(ticket) } })

export const synthesizeTts = async (params: { text: string }) => {
  try {
    return { success: true, data: await requestTtsSynthesis(params?.text, neuralTrigger) }
  } catch (error) {
    const code = (error as { code?: string })?.code
    return {
      success: false,
      msg: code === 'ECONNREFUSED'
        ? '无法连接语音服务，请确认 Human 后端已启动'
        : error instanceof Error ? error.message : '语音合成失败'
    }
  }
}

type Live2DCommand = 'get-current' | 'play-motion' | 'set-expression' | 'perform'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const ensurePetWindowReady = async () => {
  const windowManager = WindowManager.getInstance()
  windowManager.createPetWindow()

  const petWindow = windowManager.getPetWindow()
  if (!petWindow || petWindow.isDestroyed()) {
    throw new Error('Pet窗口创建失败')
  }

  if (petWindow.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      petWindow.webContents.once('did-finish-load', () => resolve())
    })
  }

  await wait(100)
  return petWindow
}

const sendLive2DCommand = async <T = unknown>(
  command: Live2DCommand,
  params: Record<string, unknown> = {}
): Promise<T> => {
  const petWindow = await ensurePetWindowReady()
  const requestId = randomUUID()
  const responseChannel = `live2d-pet-command-response:${requestId}`

  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeAllListeners(responseChannel)
      reject(new Error(`Live2D命令超时: ${command}`))
    }, 8000)

    ipcMain.once(responseChannel, (_event, response) => {
      clearTimeout(timeout)

      if (!response?.success) {
        reject(new Error(response?.msg || `Live2D命令失败: ${command}`))
        return
      }

      resolve(response.data as T)
    })

    petWindow.webContents.send('live2d-pet-command', {
      requestId,
      command,
      params
    })
  })
}

export const openWindow = async () => {
  await ensurePetWindowReady()
  return { opened: true }
}

export const getPetModels = () => {
  return getLive2DPetModelsResponse()
}

export const getCurrentModelInfo = async () => {
  return await sendLive2DCommand('get-current')
}

export const playMotion = async (group: string, index: number) => {
  return await sendLive2DCommand('play-motion', { group, index })
}

export const setExpression = async (name: string) => {
  return await sendLive2DCommand('set-expression', { name })
}

export const perform = async (payload: Live2DPerformancePayload) => {
  const parsed = parseLive2DPerformancePayload(payload)
  if (!parsed.success) {
    throw new Error(parsed.error)
  }
  if (parsed.payload.speechPlayback && !speechPlaybackGate.current(parsed.payload.speechPlayback)) {
    return { audioPlayed: false, audioError: '播报请求已过期' }
  }

  if (parsed.payload.audioUrl) {
    // Keep original string. Renderer will resolve local paths for playback.
  }

  return await sendLive2DCommand('perform', parsed.payload as unknown as Record<string, unknown>)
}
