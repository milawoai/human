import { hearingUnavailableReason } from '../../../backend-lifecycle/availability'
/**
 * Hearing — 听觉感知模块
 *
 * 通过 Neural Core 控制录音/字幕流：
 * - startHearing: HTTP trigger → Neural Core → Python 开始录音
 * - stopHearing: HTTP trigger → Neural Core → Python 停止录音
 * - WS 订阅 caption_stream.* 事件 → 转发给渲染进程
 */
import { BrowserWindow } from 'electron'
import type { BaseResponse } from '@shared/types/ipc'
import { TOPIC, SUB, isCaptionStreamTopic } from 'neural-topics'
import { neuralTrigger } from '@main/services/neural/impl/neural-http'
import { getHearingSettings } from '@main/services/config'
import { WindowManager } from '@main/windowManager'
import {
  buildCompanionQuestionPayload,
  readCompanionTranscript,
  readConversation,
  readCurrentConversation
} from '@shared/companion-conversation'
import {
  subscribeNeuralTopics,
  onNeuralMessage,
  offNeuralMessage,
  getNeuralState,
  onNeuralStateChange,
  NeuralConnectionState
} from '../../../neural/index'

// ──────────────────────────────────────────────
// 状态
// ──────────────────────────────────────────────

let neuralEventsSubscribed = false
let isListening = false
let autoPasteToFocusedAppEnabled = false
const pastedSegmentIds = new Set<string>()
const pendingConfirmedQuestions: Array<{
  requestId: string
  confirmedQuestion: string
  sessionId?: string
  source?: string
  createdAt?: number
  autoAsk?: boolean
}> = []

const MOTOR_INPUT_TEXT_TOPIC = 'motor.animation.focused_app.input_text'

const ensureNeuralEventSubscription = (): boolean => {
  if (neuralEventsSubscribed) return true
  const result = subscribeNeuralTopics(
    [
      SUB.SENSORY_HEARING_ALL,
      TOPIC.BRAIN_CORTEX_REWRITE_COMPLETED,
      TOPIC.BRAIN_CORTEX_ANSWER_STREAM_THINK,
      TOPIC.BRAIN_CORTEX_ANSWER_STREAM_CHUNK,
      TOPIC.BRAIN_CORTEX_ANSWER_COMPLETED,
      TOPIC.BRAIN_CORTEX_ANSWER_FAILED
    ],
    ['event']
  )
  neuralEventsSubscribed = result.success
  return neuralEventsSubscribed
}

onNeuralStateChange((state) => {
  if (state !== NeuralConnectionState.REGISTERED) neuralEventsSubscribed = false
})

// ──────────────────────────────────────────────
// Neural 消息处理
// ──────────────────────────────────────────────

/**
 * 处理从 Neural Core 收到的 hearing event，
 * 转发给所有打开的 BrowserWindow 渲染进程。
 */
const handleHearingEvent = (data: any): void => {
  const topic = data?.topic || ''
  const payload = data?.payload || {}
  console.log('[Sense] handleHearingEvent received:', topic, JSON.stringify(payload, null, 2))

  const isHearingTopic = isCaptionStreamTopic(topic)
  const isRewriteCompletedTopic = topic === TOPIC.BRAIN_CORTEX_REWRITE_COMPLETED
  const isAnswerTopic = [
    TOPIC.BRAIN_CORTEX_ANSWER_STREAM_THINK,
    TOPIC.BRAIN_CORTEX_ANSWER_STREAM_CHUNK,
    TOPIC.BRAIN_CORTEX_ANSWER_COMPLETED,
    TOPIC.BRAIN_CORTEX_ANSWER_FAILED,
  ].includes(topic as any)
  if (!isHearingTopic && !isRewriteCompletedTopic && !isAnswerTopic) return

  // 推送给所有窗口
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('sense:hearing-event', { topic, payload })
    }
  })

  if (isHearingTopic && payload?.type === 'segment_ready') {
    void tryAutoPasteSegment(payload)
  }
}

const tryAutoPasteSegment = async (payload: any): Promise<void> => {
  if (!autoPasteToFocusedAppEnabled) return
  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''
  if (!text) return

  const segmentId = typeof payload?.segment_id === 'string' ? payload.segment_id : ''
  if (segmentId && pastedSegmentIds.has(segmentId)) return

  try {
    await neuralTrigger({
      kind: 'command',
      topic: MOTOR_INPUT_TEXT_TOPIC,
      payload: { text }
    })
    if (segmentId) pastedSegmentIds.add(segmentId)
  } catch (error) {
    console.error('[Sense] auto paste failed:', (error as Error).message)
  }
}

// 注册消息监听（模块加载时即注册，确保不丢失事件）
offNeuralMessage('message', handleHearingEvent)
onNeuralMessage('message', handleHearingEvent)

// ──────────────────────────────────────────────
// 公共 API
// ──────────────────────────────────────────────

/** 开启监听 */
export const startHearing = async (params?: {
  subtitle_mode?: boolean
  save_audio?: boolean
  save_dir?: string
  model_id?: string
}): Promise<BaseResponse> => {
  const unavailable = hearingUnavailableReason()
  if (unavailable) return { success: false, msg: unavailable }
  console.log('[Sense] startHearing called')

  if (isListening) {
    return { success: false, msg: '已在监听中' }
  }

  // 检查 Neural 连接状态
  const neuralState = getNeuralState()
  if (!neuralState.isReady) {
    return { success: false, msg: 'Neural Core 未连接' }
  }

  try {
    // 从 store 读取录音配置作为默认值
    const hearingSettings = await getHearingSettings()

    // 订阅字幕事件（如果尚未订阅）
    if (ensureNeuralEventSubscription()) {
      console.log('[Sense] 已订阅 hearing/cortex 事件')
    }

    // 通过 HTTP trigger 触发 Python 开始录音
    // 调用方显式参数 > store 配置
    const finalSaveDir = params?.save_dir || hearingSettings.saveDir || undefined
    // 配置了保存目录时自动启用录音保存（除非调用方显式关闭）
    const finalSaveAudio = params?.save_audio ?? !!finalSaveDir

    const result = await neuralTrigger({
      kind: 'control',
      topic: TOPIC.SENSORY_HEARING_ENABLE,
      payload: {
        subtitle_mode: params?.subtitle_mode ?? true,
        save_audio: finalSaveAudio,
        save_dir: finalSaveDir,
        model_id: params?.model_id || hearingSettings.selectedAsrModelId || undefined
      }
    })

    if (result.success) {
      isListening = true
      pastedSegmentIds.clear()
      console.log('[Sense] 监听已启动')
      return { success: true, data: { sentTo: result.sentTo } }
    }

    return { success: false, msg: result.messageId || 'Trigger failed' }
  } catch (error) {
    console.error('[Sense] startHearing error:', (error as Error).message)
    return { success: false, msg: (error as Error).message }
  }
}

/** 停止监听 */
export const stopHearing = async (): Promise<BaseResponse> => {
  console.log('[Sense] stopHearing called')

  if (!isListening) {
    return { success: false, msg: '未在监听中' }
  }

  try {
    // 通过 HTTP trigger 触发 Python 停止录音
    const result = await neuralTrigger({
      kind: 'control',
      topic: TOPIC.SENSORY_HEARING_DISABLE,
      payload: {}
    }, { timeoutMs: 5000 })
    if (!result.success) {
      isListening = false
      console.error('[Sense] 监听关闭失败')
      return { success: false, data: { msg: result.messageId || 'Trigger failed' } }
    }

    isListening = false
    pastedSegmentIds.clear()

    console.log('[Sense] 监听已停止')
    return { success: true, data: { sentTo: result.sentTo } }
  } catch (error) {
    console.error('[Sense] stopHearing error:', error)
    isListening = false
    return { success: false, msg: (error as Error).message }
  }
}

/** 获取监听状态 */
export const getHearingStatus = async (): Promise<BaseResponse> => {
  return {
    success: true,
    data: {
      isListening,
      neuralReady: getNeuralState().isReady,
      autoPasteToFocusedAppEnabled
    }
  }
}

export const setAutoPasteToFocusedApp = async (
  params?: { enabled?: boolean }
): Promise<BaseResponse> => {
  autoPasteToFocusedAppEnabled = Boolean(params?.enabled)
  return {
    success: true,
    data: {
      autoPasteToFocusedAppEnabled
    }
  }
}

export const buildHearingQuestionPayload = (params: {
  text: string
  requestId?: string
  sessionId?: string
}) => {
  const text = params.text.trim()
  return {
    type: 'finalized',
    text,
    requestId: params.requestId || '',
    sessionId: params.sessionId || '',
    source: 'body.hearing-panel',
    createdAt: Date.now()
  }
}

export const submitHearingQuestion = async (params: {
  text: string
  requestId?: string
  sessionId?: string
}): Promise<BaseResponse> => {
  const payload = buildHearingQuestionPayload(params)
  if (!payload.text) {
    return { success: false, msg: '文本为空，无法提交提问' }
  }

  const neuralState = getNeuralState()
  if (!neuralState.isReady) {
    return { success: false, msg: 'Neural Core 未连接，无法提交提问' }
  }

  try {
    console.log(
      '[Sense] submitHearingQuestion:',
      TOPIC.BRAIN_CORTEX_REWRITE_REQUESTED,
      JSON.stringify(payload)
    )
    const result = await neuralTrigger({
      kind: 'command',
      topic: TOPIC.BRAIN_CORTEX_REWRITE_REQUESTED,
      payload
    })
    if (!result?.success) {
      return { success: false, msg: result?.messageId || result?.msg || '提交提问失败' }
    }
    return { success: true, data: result }
  } catch (error) {
    return { success: false, msg: (error as Error).message }
  }
}

export const submitRewriteConfirmed = async (params: {
  confirmedQuestion: string
  requestId?: string
  sessionId?: string
}): Promise<BaseResponse> => {
  const confirmedQuestion = params.confirmedQuestion.trim()
  if (!confirmedQuestion) {
    return { success: false, msg: '确认问题为空，无法提交' }
  }

  const neuralState = getNeuralState()
  if (!neuralState.isReady) {
    return { success: false, msg: 'Neural Core 未连接，无法提交确认问题' }
  }

  const payload = {
    type: 'confirmed',
    requestId: params.requestId || '',
    sessionId: params.sessionId || '',
    confirmedQuestion,
    source: 'body.hearing-panel',
    createdAt: Date.now(),
  }

    pendingConfirmedQuestions.push({
      requestId: payload.requestId,
      confirmedQuestion: payload.confirmedQuestion,
      sessionId: payload.sessionId || undefined,
      source: payload.source,
      createdAt: payload.createdAt,
      autoAsk: true,
    })
  const wm = WindowManager.getInstance()
  wm.createChatPanelWindow()
  const companion = wm.getChatPanelWindow()
  if (companion && !companion.isDestroyed()) {
    companion.webContents.send('sense:hearing-confirmed', { ...payload, autoAsk: true })
  }
  return { success: true, data: { openedCompanion: true, requestId: payload.requestId } }
}

/** 打开录音面板（同时启动监听） */
export const openHearingPanel = async (): Promise<BaseResponse> => {
  console.log('[Sense] openHearingPanel called')

  const wm = WindowManager.getInstance()
  const existingPanel = wm.getHearingPanelWindow()
  if (existingPanel && !existingPanel.isDestroyed()) {
    // 单击切换：已打开则关闭（并停止录音）
    if (isListening) {
      await stopHearing()
    }
    return wm.closeHearingPanelWindow()
  }

  // 先创建面板窗口，确保 listener 注册完毕再启动监听
  // 否则 prepared/started 事件会在面板 mount 之前发出，导致面板停留在"未连接"
  wm.createHearingPanelWindow()

  // 等待渲染进程就绪
  await new Promise(resolve => setTimeout(resolve, 300))

  // 再启动监听
  const hearResult = await startHearing()
  if (!hearResult.success) {
    console.warn('[Sense] startHearing failed:', hearResult.msg)
    return hearResult
  }

  return hearResult
}

/** 关闭录音面板（同时停止监听） */
export const closeHearingPanel = async (): Promise<BaseResponse> => {
  console.log('[Sense] closeHearingPanel called')
  // 先停止录音（忽略错误，确保窗口能关闭）
  if (isListening) {
    await stopHearing()
  }
  const wm = WindowManager.getInstance()
  return wm.closeHearingPanelWindow()
}

export const openChatPanel = async (): Promise<BaseResponse> => {
  ensureNeuralEventSubscription()
  const wm = WindowManager.getInstance()
  return wm.createChatPanelWindow()
}

export const closeChatPanel = async (): Promise<BaseResponse> => {
  const wm = WindowManager.getInstance()
  return wm.closeChatPanelWindow()
}

export const consumePendingHearingConfirmed = async (): Promise<BaseResponse> => {
  const items = pendingConfirmedQuestions.splice(0, pendingConfirmedQuestions.length)
  return {
    success: true,
    data: items,
  }
}

export const submitCompanionQuestion = async (params: {
  question: string
  requestId?: string
  conversationId: string
  speechSummaryEnabled?: boolean
}): Promise<BaseResponse> => {
  try {
    const payload = buildCompanionQuestionPayload(params)
    ensureNeuralEventSubscription()
    const result = await neuralTrigger({
      kind: 'command',
      topic: 'brain.cortex.ask.requested',
      payload,
    })
    if (!result?.success) {
      return { success: false, msg: result?.msg || result?.messageId || '会话提问失败' }
    }
    return { success: true, data: result }
  } catch (error) {
    return { success: false, msg: (error as Error).message }
  }
}

export const getCurrentCompanionConversation = async (): Promise<BaseResponse> => {
  try {
    const result = await neuralTrigger({
      kind: 'query',
      topic: TOPIC.BRAIN_CONVERSATION_CURRENT_GET,
      payload: {}
    })
    return { success: true, data: { conversation: readCurrentConversation(result) } }
  } catch (error) {
    return { success: false, msg: (error as Error).message }
  }
}

export const createCompanionConversation = async (): Promise<BaseResponse> => {
  try {
    const result = await neuralTrigger({
      kind: 'command',
      topic: TOPIC.BRAIN_CONVERSATION_CREATE,
      payload: { conversationType: 'companion' }
    })
    return { success: true, data: { conversation: readConversation(result) } }
  } catch (error) {
    return { success: false, msg: (error as Error).message }
  }
}

export const getCompanionTranscript = async (conversationId: string): Promise<BaseResponse> => {
  try {
    const result = await neuralTrigger({
      kind: 'query',
      topic: TOPIC.BRAIN_CONVERSATION_TRANSCRIPT_GET,
      payload: { conversationId }
    })
    return { success: true, data: { conversationId, messages: readCompanionTranscript(result, conversationId) } }
  } catch (error) {
    return { success: false, msg: (error as Error).message }
  }
}

/** 获取 ASR 模型列表（通过 Neural Core query 中转 Python） */
export const listAsrModels = async (): Promise<BaseResponse> => {
  try {
    return await neuralTrigger({
      kind: 'query',
      topic: TOPIC.SENSORY_HEARING_ASR_MODELS,
      payload: {}
    })
  } catch (error) {
    console.error('[Sense] listAsrModels error:', (error as Error).message)
    return { success: false, msg: (error as Error).message }
  }
}
