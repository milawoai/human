<script setup lang="ts">
import type { IpcProxy } from '@renderer/plugin/ipc'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'

const ipc = inject<IpcProxy>('ipc')!

// ──────────────────────────────────────────────
// 状态
// ──────────────────────────────────────────────

interface Segment {
  segmentId: string
  text: string
  startTime: number
  endTime?: number
  duration?: number
}

interface ChatTurn {
  requestId: string
  question: string
  think: string
  answer: string
  status: 'answering' | 'completed' | 'failed'
  error?: string
}

const sessionState = ref<'idle' | 'prepared' | 'recording' | 'stopped' | 'error'>('idle')
const statusLabel = ref('未连接')
const segments = ref<Segment[]>([])
const fullText = ref('')
const editableText = ref('')
const errorMessage = ref('')
const totalDuration = ref(0)
const isClosing = ref(false)
const autoPasteToFocusedAppEnabled = ref(false)
const currentSessionId = ref('')
const currentRewriteRequestId = ref('')
const thinkText = ref('')
const answerText = ref('')
const viewMode = ref<'capture' | 'chat'>('capture')
const chatTurns = ref<ChatTurn[]>([])
const chatInput = ref('')

// ──────────────────────────────────────────────
// 计算属性
// ──────────────────────────────────────────────

const transcriptText = computed(() => {
  if (fullText.value) return fullText.value
  if (segments.value.length > 0) {
    return segments.value.map((s) => s.text || '/sil').join(' ')
  }
  return ''
})

const statusSeverity = computed(() => {
  switch (sessionState.value) {
    case 'prepared':
      return 'success'
    case 'recording':
      return 'info'
    case 'error':
      return 'danger'
    case 'stopped':
      return 'warn'
    default:
      return 'secondary'
  }
})

const activeTurn = computed(() => {
  if (chatTurns.value.length === 0) return null
  return chatTurns.value[chatTurns.value.length - 1]
})

// ──────────────────────────────────────────────
// 事件处理
// ──────────────────────────────────────────────

const handleHearingEvent = (_event: any, data: any) => {
  const topic = data?.topic || ''
  const payload = data?.payload || {}
  const type = payload.type || ''

  if (topic === 'brain.cortex.rewrite.completed') {
    const normalizedQuestion = String(payload?.normalizedQuestion || '').trim()
    if (normalizedQuestion) {
      currentRewriteRequestId.value = String(payload?.requestId || currentRewriteRequestId.value || '')
      editableText.value = normalizedQuestion
      sessionState.value = 'stopped'
      statusLabel.value = '改写完成'
    }
    return
  }
  if (topic.startsWith('brain.cortex.answer.')) return

  // 只处理 caption_stream 相关 topic
  if (!topic.includes('caption_stream')) return

  switch (type) {
    case 'prepared':
      sessionState.value = 'prepared'
      statusLabel.value = '就绪'
      break

    case 'started':
      sessionState.value = 'recording'
      statusLabel.value = '录音中'
      currentSessionId.value = payload.session_id || ''
      segments.value = []
      fullText.value = ''
      editableText.value = ''
      errorMessage.value = ''
      totalDuration.value = 0
      currentRewriteRequestId.value = ''
      thinkText.value = ''
      answerText.value = ''
      viewMode.value = 'capture'
      chatTurns.value = []
      chatInput.value = ''
      break

    case 'vad_start':
      statusLabel.value = '检测到语音'
      break

    case 'segment_ready': {
      sessionState.value = 'recording'
      statusLabel.value = '识别中'
      const seg: Segment = {
        segmentId: payload.segment_id || '',
        text: payload.text || '',
        startTime: payload.start_time || 0,
        endTime: payload.end_time,
        duration: payload.duration
      }
      // 避免重复添加
      if (seg.segmentId && !segments.value.find((s) => s.segmentId === seg.segmentId)) {
        segments.value.push(seg)
        editableText.value = transcriptText.value
        if (seg.duration) {
          totalDuration.value += seg.duration
        }
      }
      break
    }

    case 'vad_end':
      statusLabel.value = '录音中'
      break

    case 'stopped':
      sessionState.value = 'stopped'
      statusLabel.value = '已停止'
      editableText.value = transcriptText.value
      break

    case 'error':
      sessionState.value = 'error'
      statusLabel.value = '错误'
      errorMessage.value = payload.message || '未知错误'
      break
  }
}

// ──────────────────────────────────────────────
// 方法
// ──────────────────────────────────────────────

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatTime = (seconds: number): string => {
  return seconds.toFixed(1) + 's'
}

const copyText = async () => {
  if (editableText.value) {
    await navigator.clipboard.writeText(editableText.value)
  }
}

const isRecording = computed(() => sessionState.value === 'recording' || sessionState.value === 'prepared')

const stopRecording = async () => {
  await ipc.sense.stopHearing()
}

const stopAndAsk = async () => {
  const text = editableText.value.trim()
  if (!text) return

  await ipc.sense.stopHearing()
  const result = await ipc.sense.submitHearingQuestion({
    text,
    requestId: crypto.randomUUID(),
    sessionId: currentSessionId.value || undefined
  })
  if (!result?.success) {
    errorMessage.value = result?.msg || '提交提问失败'
    sessionState.value = 'error'
    statusLabel.value = '错误'
    return
  }

  const normalizedQuestion = String(result?.data?.data?.normalizedQuestion || '').trim()
  const rewriteRequestId = String(result?.data?.data?.requestId || '').trim()
  if (rewriteRequestId) {
    currentRewriteRequestId.value = rewriteRequestId
  }
  if (normalizedQuestion) {
    editableText.value = normalizedQuestion
    sessionState.value = 'stopped'
    statusLabel.value = '改写完成'
  }
}

const confirmQuestion = async () => {
  const confirmedQuestion = editableText.value.trim()
  if (!confirmedQuestion) return

  const result = await ipc.sense.submitRewriteConfirmed({
    confirmedQuestion,
    requestId: currentRewriteRequestId.value || crypto.randomUUID(),
    sessionId: currentSessionId.value || undefined,
  })
  if (!result?.success) {
    errorMessage.value = result?.msg || '确认提问失败'
    sessionState.value = 'error'
    statusLabel.value = '错误'
    return
  }

  statusLabel.value = '已发送到会话窗口'
}

const sendFollowup = async () => {
  const question = chatInput.value.trim()
  if (!question) return
  const requestId = crypto.randomUUID()
  currentRewriteRequestId.value = requestId
  thinkText.value = ''
  answerText.value = ''
  errorMessage.value = ''
  statusLabel.value = '回答中'
  chatTurns.value.push({
    requestId,
    question,
    think: '',
    answer: '',
    status: 'answering',
  })
  chatInput.value = ''

  const result = await ipc.sense.submitRewriteConfirmed({
    confirmedQuestion: question,
    requestId,
    sessionId: currentSessionId.value || undefined,
  })
  if (!result?.success) {
    errorMessage.value = result?.msg || '继续提问失败'
    statusLabel.value = '错误'
    if (activeTurn.value) {
      activeTurn.value.status = 'failed'
      activeTurn.value.error = errorMessage.value
    }
    return
  }
  const syncThink = String(result?.data?.data?.think || '').trim()
  const syncAnswer = String(result?.data?.data?.answer || '').trim()
  if (syncThink) thinkText.value = syncThink
  if (syncAnswer) {
    answerText.value = syncAnswer
    statusLabel.value = '回答完成'
  }
  if (activeTurn.value) {
    if (syncThink) activeTurn.value.think = syncThink
    if (syncAnswer) {
      activeTurn.value.answer = syncAnswer
      activeTurn.value.status = 'completed'
    }
  }
}

const closePanel = async () => {
  if (isClosing.value) return
  isClosing.value = true
  try {
    // The main process stops an active recording before closing the window.
    const result = await ipc.sense.closeHearingPanel()
    if (!result?.success) errorMessage.value = result?.msg || '关闭录音面板失败'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '关闭录音面板失败'
  } finally {
    isClosing.value = false
  }
}

const onToggleAutoPaste = async () => {
  const result = await ipc.sense.setAutoPasteToFocusedApp({
    enabled: autoPasteToFocusedAppEnabled.value
  })
  if (!result?.success) {
    autoPasteToFocusedAppEnabled.value = !autoPasteToFocusedAppEnabled.value
  }
}

// ──────────────────────────────────────────────
// 生命周期
// ──────────────────────────────────────────────

onMounted(() => {
  ipc.sense.getHearingStatus().then((result) => {
    if (result?.success) {
      autoPasteToFocusedAppEnabled.value = Boolean(
        result.data?.autoPasteToFocusedAppEnabled
      )
    }
  })
  window.electron.ipcRenderer.on('sense:hearing-event', handleHearingEvent)
})

onUnmounted(() => {
  window.electron.ipcRenderer.off('sense:hearing-event', handleHearingEvent)
})
</script>

<template>
  <main class="hearing-panel">
    <!-- 顶栏 -->
    <div class="panel-header">
      <span class="header-title">
        <i class="pi pi-microphone" />
        录音面板
      </span>
      <Button
        icon="pi pi-times"
        size="small"
        text
        :disabled="isClosing"
        :loading="isClosing"
        class="close-btn"
        @click="closePanel"
      />
    </div>

    <div class="panel-body">
      <div v-if="viewMode === 'capture'" class="view-capture">
      <!-- 状态显示 -->
      <div class="status-display">
        <div class="status-item">
          <span class="status-label">状态:</span>
          <Tag :value="statusLabel" :severity="statusSeverity" />
        </div>
        <div v-if="totalDuration > 0" class="status-item">
          <span class="status-label">时长:</span>
          <span>{{ formatDuration(totalDuration) }}</span>
        </div>
      </div>

      <!-- 录音控制 -->
      <div class="recorder-controls">
        <Button
          :disabled="!isRecording"
          severity="danger"
          size="small"
          @click="stopRecording"
        >
          <i class="pi pi-stop" />
          <span>停止录音</span>
        </Button>
        <Button
          :disabled="!isRecording || !editableText.trim()"
          severity="contrast"
          size="small"
          @click="stopAndAsk"
        >
          <i class="pi pi-send" />
          <span>结束并书面化</span>
        </Button>
        <Button
          :disabled="sessionState !== 'stopped' || !editableText.trim()"
          severity="success"
          size="small"
          @click="confirmQuestion"
        >
          <i class="pi pi-check" />
          <span>确认提问</span>
        </Button>
      </div>

      <div class="auto-paste-row">
        <span class="auto-paste-label">字幕自动粘贴到当前焦点应用</span>
        <ToggleSwitch
          v-model="autoPasteToFocusedAppEnabled"
          @update:model-value="onToggleAutoPaste"
        />
      </div>

      <!-- 实时字幕 -->
      <div v-if="segments.length > 0 || editableText" class="subtitle-section">
        <div class="section-header">
          <label class="section-label">实时字幕</label>
          <Button
            v-if="editableText"
            icon="pi pi-copy"
            text
            size="small"
            @click="copyText"
          />
        </div>
        <div class="subtitle-textarea">
          <textarea
            v-model="editableText"
            :readonly="sessionState !== 'stopped'"
            placeholder="等待说话..."
            rows="4"
          />
        </div>
        <div v-if="segments.length > 0" class="segment-list">
          <div v-for="seg in segments" :key="seg.segmentId" class="segment-item">
            <span class="segment-time">[{{ formatTime(seg.startTime) }}]</span>
            <span class="segment-text">{{ seg.text || '/sil' }}</span>
          </div>
        </div>
      </div>

      <div v-if="thinkText || answerText" class="answer-sections">
        <div v-if="thinkText" class="answer-block">
          <label class="section-label">Think</label>
          <textarea :value="thinkText" rows="5" readonly placeholder="等待思考内容..." />
        </div>
        <div v-if="answerText" class="answer-block">
          <label class="section-label">Answer</label>
          <textarea :value="answerText" rows="6" readonly placeholder="等待正式回答..." />
        </div>
      </div>

      <!-- 错误 -->
      <div v-if="errorMessage" class="error-message">
        <i class="pi pi-exclamation-circle" />
        {{ errorMessage }}
      </div>
      </div>

      <div v-else class="view-chat">
        <div class="status-display">
          <div class="status-item">
            <span class="status-label">状态:</span>
            <Tag :value="statusLabel" :severity="statusSeverity" />
          </div>
        </div>
        <div class="chat-list">
          <div v-for="turn in chatTurns" :key="turn.requestId" class="chat-turn">
            <div class="chat-q">Q: {{ turn.question }}</div>
            <div v-if="turn.think" class="chat-think">Think: {{ turn.think }}</div>
            <div class="chat-a">A: {{ turn.answer || '回答生成中...' }}</div>
            <div v-if="turn.status === 'failed'" class="chat-err">{{ turn.error || '回答失败' }}</div>
          </div>
        </div>
        <div class="chat-input-row">
          <textarea v-model="chatInput" rows="3" placeholder="继续提问..." />
          <Button severity="success" size="small" :disabled="!chatInput.trim()" @click="sendFollowup">
            <i class="pi pi-send" />
            <span>发送</span>
          </Button>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.hearing-panel {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(24, 24, 28, 0.88);
  color: #fff;
  font-family:
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
  overflow: hidden;
  backdrop-filter: blur(12px);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  -webkit-app-region: drag;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.close-btn {
  -webkit-app-region: no-drag;
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
}

.view-capture,
.view-chat {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-display {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
}

.status-label {
  color: rgba(255, 255, 255, 0.5);
}

.recorder-controls {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.recorder-controls span {
  margin-left: 4px;
  white-space: nowrap;
}

.auto-paste-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.auto-paste-label {
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.8);
}

.subtitle-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.answer-sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.answer-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.answer-block textarea,
.chat-input-row textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  background: rgba(12, 14, 18, 0.82);
  color: rgba(245, 247, 250, 0.95);
  font-size: 0.9rem;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
}

.subtitle-textarea textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  font-size: 0.9rem;
  line-height: 1.5;
  resize: none;
  font-family: inherit;
}

.segment-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
}

.segment-item {
  display: flex;
  gap: 8px;
  font-size: 0.82rem;
}

.segment-time {
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

.segment-text {
  color: rgba(255, 255, 255, 0.85);
}

.error-message {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #ff8787;
  font-size: 0.85rem;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
}

.chat-turn {
  padding: 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.chat-q {
  color: rgba(190, 230, 255, 0.95);
  margin-bottom: 6px;
}

.chat-think {
  color: rgba(255, 220, 170, 0.95);
  white-space: pre-wrap;
  margin-bottom: 6px;
}

.chat-a {
  color: rgba(240, 245, 250, 0.95);
  white-space: pre-wrap;
}

.chat-err {
  margin-top: 6px;
  color: #ff8787;
}

.chat-input-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
