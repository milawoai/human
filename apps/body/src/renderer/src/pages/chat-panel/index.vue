<script setup lang="ts">
import { Chat as TChat } from '@tdesign-vue-next/chat'
import type { ChatReasoning } from '@tdesign-vue-next/chat'
import type { IpcProxy } from '@renderer/plugin/ipc'
import Button from 'primevue/button'
import { computed, inject, onMounted, onUnmounted, ref, nextTick } from 'vue'
import { readSpeechPreference, saveSpeechPreference, playSessionSpeech } from '@shared/session-speech'

const ipc = inject<IpcProxy>('ipc')!

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  datetime?: string
  status?: 'pending' | 'success' | 'error'
  reasoning?: boolean | ChatReasoning
  reasoningContent?: string
}

// ──────────────────────────────────────────────
// 状态
// ──────────────────────────────────────────────

const messageList = ref<ChatMessage[]>([])
const statusLabel = ref('等待提问')
const chatInput = ref('')
const errorMessage = ref('')
const isAILoading = ref(false)
const voiceState = ref<'idle' | 'recording' | 'rewriting' | 'error'>('idle')
const voiceDraft = ref('')
const voiceError = ref('')
const currentVoiceSessionId = ref('')
const currentRewriteRequestId = ref('')
const chatSessionKey = 'human:chat-panel:session-id'
const chatSessionId = ref(localStorage.getItem(chatSessionKey) || crypto.randomUUID())
localStorage.setItem(chatSessionKey, chatSessionId.value)
const speechEnabled = ref(readSpeechPreference(localStorage, chatSessionId.value))
const speechNotice = ref('')
let speechEpoch = 0
let latestRequestId = ''
let disposed = false
const updatePlayback = (token = '') => { void ipc.live2d.setSpeechPlaybackState({ scope: 'chat-panel', token }).catch(() => {}) }
const beforeUnloadSpeech = () => { ++speechEpoch; updatePlayback() }
const changeSpeech = () => {
  ++speechEpoch
  updatePlayback()
  speechNotice.value = ''
  try { saveSpeechPreference(localStorage, chatSessionId.value, speechEnabled.value) }
  catch { speechEnabled.value = false; speechNotice.value = '无法保存播报设置，已保持关闭' }
}
const newChatSession = () => {
  if (isAILoading.value) return
  ++speechEpoch
  latestRequestId = ''
  updatePlayback()
  chatSessionId.value = crypto.randomUUID()
  localStorage.setItem(chatSessionKey, chatSessionId.value)
  speechEnabled.value = false
  speechNotice.value = ''
  messageList.value = []
  statusLabel.value = '等待提问'
}

// ──────────────────────────────────────────────
// 计算属性
// ──────────────────────────────────────────────

const activeAssistantMessage = computed(() => {
  for (let i = messageList.value.length - 1; i >= 0; i--) {
    if (messageList.value[i].role === 'assistant') {
      return messageList.value[i]
    }
  }
  return null
})

const isVoiceActive = computed(() => voiceState.value !== 'idle')
const canSendVoiceDraft = computed(() => voiceDraft.value.trim().length > 0)
const voiceStatusLabel = computed(() => {
  switch (voiceState.value) {
    case 'recording':
      return '录音中'
    case 'rewriting':
      return '书面化中'
    case 'error':
      return '语音输入错误'
    default:
      return '语音输入'
  }
})

// ──────────────────────────────────────────────
// 方法
// ──────────────────────────────────────────────

const findMessageById = (id: string) => {
  return messageList.value.find((m) => m.id === id)
}

const appendVoiceDraft = (text: string) => {
  const segment = text.trim()
  if (!segment) return
  voiceDraft.value = voiceDraft.value ? `${voiceDraft.value} ${segment}` : segment
}

const buildReasoning = (content: string, status: 'thinking' | 'success'): ChatReasoning => ({
  expandIconPlacement: 'right',
  collapsed: false,
  collapsePanelProps: {
    header: status === 'thinking' ? '思考中' : '思考过程',
    content
  }
})

const sendQuestion = async (text?: string) => {
  const question = text || chatInput.value.trim()
  if (!question) return

  const requestId = crypto.randomUUID()
  latestRequestId = requestId
  const sessionId = chatSessionId.value
  const narrate = speechEnabled.value
  const epoch = ++speechEpoch
  const speechPlayback = { scope: 'chat-panel', token: crypto.randomUUID() }
  updatePlayback(narrate ? speechPlayback.token : '')
  const currentSpeech = () => !disposed && latestRequestId === requestId && chatSessionId.value === sessionId && speechEpoch === epoch && speechEnabled.value && narrate
  speechNotice.value = ''
  statusLabel.value = '回答中'
  errorMessage.value = ''
  isAILoading.value = true

  // 添加用户消息
  messageList.value.push({
    id: `u-${requestId}`,
    role: 'user',
    content: question,
    datetime: new Date().toLocaleTimeString(),
    status: 'success'
  })

  // 添加 AI 占位消息
  const assistantMsg: ChatMessage = {
    id: requestId,
    role: 'assistant',
    content: '',
    datetime: new Date().toLocaleTimeString(),
    status: 'pending',
    reasoning: false,
    reasoningContent: ''
  }
  messageList.value.push(assistantMsg)

  chatInput.value = ''
  
  // 滚动到底部
  await nextTick()

  const result = await ipc.sense.submitCompanionQuestion({
    question,
    requestId,
    sessionId,
    speechSummaryEnabled: narrate
  })
  if (disposed || latestRequestId !== requestId) return

  if (!result?.success) {
    errorMessage.value = result?.msg || '提问失败'
    statusLabel.value = '错误'
    assistantMsg.role = 'error'
    assistantMsg.status = 'error'
    assistantMsg.content = errorMessage.value
    isAILoading.value = false
    return
  }

  const syncThink = String(result?.data?.data?.think || '').trim()
  const syncAnswer = String(result?.data?.data?.answer || '').trim()
  
  if (syncThink) {
    assistantMsg.reasoningContent = syncThink
    assistantMsg.reasoning = buildReasoning(syncThink, 'success')
  }
  if (syncAnswer) {
    assistantMsg.content = syncAnswer
    assistantMsg.status = 'success'
    statusLabel.value = '回答完成'
    isAILoading.value = false
  }
  if (currentSpeech()) {
    const speech = result?.data?.data?.speech
    const message = speech ? await playSessionSpeech(speech, currentSpeech, payload => ipc.live2d.perform({ ...payload, speechPlayback })) : '本轮未生成有效的播报摘要，已保留文字回复'
    if (currentSpeech()) speechNotice.value = message
  }
}

const handleHearingEvent = (_event: any, data: any) => {
  const topic = data?.topic || ''
  const payload = data?.payload || {}
  const requestId = String(payload?.requestId || '')

  if (topic.includes('caption_stream') && payload?.type === 'segment_ready') {
    if (voiceState.value === 'recording') {
      appendVoiceDraft(String(payload?.text || ''))
    }
    return
  }

  if (topic.includes('caption_stream') && payload?.type === 'started') {
    currentVoiceSessionId.value = String(payload?.session_id || '')
    voiceState.value = 'recording'
    return
  }

  if (topic === 'brain.cortex.rewrite.completed') {
    if (requestId && requestId !== currentRewriteRequestId.value) return

    const normalizedQuestion = String(payload?.normalizedQuestion || '').trim()
    if (normalizedQuestion) {
      chatInput.value = normalizedQuestion
      voiceDraft.value = normalizedQuestion
      voiceState.value = 'idle'
      statusLabel.value = '等待发送'
      voiceError.value = ''
    }
    return
  }

  const targetMsg = requestId ? findMessageById(requestId) : activeAssistantMessage.value
  if (!targetMsg) return
  if (topic.startsWith('brain.cortex.answer.') && requestId !== latestRequestId) return

  if (topic === 'brain.cortex.answer.stream.think') {
    const content = String(payload?.content || '')
    if (!content) return
    const currentReasoning = targetMsg.reasoningContent || ''
    targetMsg.reasoningContent = `${currentReasoning}${content}`
    targetMsg.reasoning = buildReasoning(targetMsg.reasoningContent, 'thinking')
    statusLabel.value = '回答中'
    isAILoading.value = true
    return
  }

  if (topic === 'brain.cortex.answer.stream.chunk') {
    const content = String(payload?.content || '')
    if (!content) return
    targetMsg.content = `${targetMsg.content}${content}`
    
    // 如果有正在进行的思考，标记为完成
    if (targetMsg.reasoningContent) {
      targetMsg.reasoning = buildReasoning(targetMsg.reasoningContent, 'success')
    }
    
    statusLabel.value = '回答中'
    isAILoading.value = true
    return
  }

  if (topic === 'brain.cortex.answer.completed') {
    const answer = String(payload?.answer || '').trim()
    if (answer) targetMsg.content = answer
    targetMsg.status = 'success'
    if (targetMsg.reasoningContent) {
      targetMsg.reasoning = buildReasoning(targetMsg.reasoningContent, 'success')
    }
    statusLabel.value = '回答完成'
    isAILoading.value = false
    return
  }

  if (topic === 'brain.cortex.answer.failed') {
    const err = String(payload?.error || '回答失败')
    targetMsg.role = 'error'
    targetMsg.status = 'error'
    targetMsg.content = err
    errorMessage.value = err
    statusLabel.value = '错误'
    isAILoading.value = false
  }
}

const handleConfirmed = (_event: any, payload: any) => {
  const question = String(payload?.confirmedQuestion || '').trim()
  const requestId = String(payload?.requestId || '').trim() || crypto.randomUUID()
  
  if (!question) return
  if (findMessageById(requestId)) return

  sendQuestion(question)
}

const startVoiceInput = async () => {
  voiceError.value = ''
  voiceDraft.value = ''
  currentVoiceSessionId.value = ''
  currentRewriteRequestId.value = ''

  const result = await ipc.sense.startHearing()
  if (!result?.success) {
    voiceState.value = 'error'
    voiceError.value = result?.msg || '启动录音失败'
    return
  }

  voiceState.value = 'recording'
}

const stopVoiceInput = async () => {
  if (voiceState.value !== 'recording') {
    voiceState.value = 'idle'
    if (voiceDraft.value.trim()) {
      chatInput.value = voiceDraft.value.trim()
    }
    return
  }

  const result = await ipc.sense.stopHearing()
  if (!result?.success) {
    voiceState.value = 'error'
    voiceError.value = result?.msg || '停止录音失败'
    return
  }

  voiceState.value = 'idle'
  if (voiceDraft.value.trim()) {
    chatInput.value = voiceDraft.value.trim()
  }
}

const stopAndRewriteVoice = async () => {
  const text = voiceDraft.value.trim()
  if (!text) return

  await ipc.sense.stopHearing()
  const requestId = crypto.randomUUID()
  currentRewriteRequestId.value = requestId
  voiceState.value = 'rewriting'
  voiceError.value = ''

  const result = await ipc.sense.submitHearingQuestion({
    text,
    requestId,
    sessionId: currentVoiceSessionId.value || undefined
  })

  if (!result?.success) {
    voiceState.value = 'error'
    voiceError.value = result?.msg || '书面化失败'
    return
  }

  const normalizedQuestion = String(result?.data?.data?.normalizedQuestion || '').trim()
  if (normalizedQuestion) {
    chatInput.value = normalizedQuestion
    voiceDraft.value = normalizedQuestion
    voiceState.value = 'idle'
  }
}

const closePanel = async () => {
  ++speechEpoch
  updatePlayback()
  await ipc.sense.closeChatPanel()
}

// ──────────────────────────────────────────────
// 模型快切器（human-48b）
// ──────────────────────────────────────────────

interface ModelProfile {
  name: string
  model?: string
  models?: string[]
  defaultModel?: string
  baseUrl?: string
}
const RECENT_MODELS_KEY = 'human.recentModels'
const modelMenuOpen = ref(false)
const defaultProfile = ref('')
const modelProfiles = ref<ModelProfile[]>([])
const recentModels = ref<string[]>(JSON.parse(localStorage.getItem(RECENT_MODELS_KEY) ?? '[]'))
const modelToast = ref('')
let modelToastTimer: ReturnType<typeof setTimeout> | undefined

const currentModelLabel = computed(() => {
  const p = modelProfiles.value.find((x) => x.name === defaultProfile.value)
  return p?.model || defaultProfile.value || '未配置'
})

const showModelToast = (msg: string) => {
  modelToast.value = msg
  if (modelToastTimer) clearTimeout(modelToastTimer)
  modelToastTimer = setTimeout(() => (modelToast.value = ''), 3000)
}

const loadModels = async () => {
  try {
    const result = await ipc.modelConfig.list()
    const data = result?.data ?? {}
    modelProfiles.value = Array.isArray(data.profiles) ? data.profiles : []
    defaultProfile.value = typeof data.defaultProfile === 'string' ? data.defaultProfile : ''
  } catch {
    /* 快切器失败静默：不干扰聊天主功能 */
  }
}

const toggleModelMenu = () => {
  modelMenuOpen.value = !modelMenuOpen.value
  if (modelMenuOpen.value) void loadModels()
}

const rememberRecent = (label: string) => {
  const next = [label, ...recentModels.value.filter((m) => m !== label)].slice(0, 3)
  recentModels.value = next
  localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(next))
}

const doSwitchModel = async (profile: string, model: string) => {
  try {
    const result = await ipc.modelConfig.switchModel({ profile, model })
    if (result?.success) {
      defaultProfile.value = profile
      rememberRecent(`${profile}::${model}`)
      modelMenuOpen.value = false
      showModelToast(`已切换到 ${model}，下轮对话生效`)
    } else {
      showModelToast(result?.msg || '切换失败')
    }
  } catch (error) {
    showModelToast(`切换失败: ${(error as Error).message}`)
  }
}

const openConfigWindow = () => {
  modelMenuOpen.value = false
  void ipc.window.openConfigWindow()
}

onMounted(() => {
  window.addEventListener('beforeunload', beforeUnloadSpeech)
  void loadModels()
  ipc.sense.consumePendingHearingConfirmed().then((result) => {
    const items = Array.isArray(result?.data) ? result.data : []
    for (const item of items) {
      handleConfirmed(null, item)
    }
  })
  window.electron.ipcRenderer.on('sense:hearing-event', handleHearingEvent)
  window.electron.ipcRenderer.on('sense:hearing-confirmed', handleConfirmed)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', beforeUnloadSpeech)
  disposed = true
  ++speechEpoch
  updatePlayback()
  window.electron.ipcRenderer.off('sense:hearing-event', handleHearingEvent)
  window.electron.ipcRenderer.off('sense:hearing-confirmed', handleConfirmed)
})
</script>

<template>
  <main class="chat-panel-container">
    <div class="panel-header">
      <span class="header-title">
        <i class="pi pi-comments" />
        AI 助手
      </span>
      <div class="header-actions">
        <div class="model-switcher">
          <button class="model-chip" @click="toggleModelMenu">
            <span class="model-dot" />
            {{ currentModelLabel }}
            <i class="pi pi-chevron-down" />
          </button>
          <div v-if="modelMenuOpen" class="model-menu">
            <div v-if="recentModels.length" class="menu-group-label">最近使用</div>
            <button
              v-for="item in recentModels"
              :key="item"
              class="menu-item"
              @click="doSwitchModel(item.split('::')[0], item.split('::')[1])"
            >
              <i class="pi pi-history" />
              {{ item.split('::')[1] }}
              <span class="menu-sub">{{ item.split('::')[0] }}</span>
            </button>
            <div class="menu-group-label">全部档案</div>
            <template v-for="p in modelProfiles" :key="p.name">
              <div class="menu-profile">{{ p.name }}<span v-if="p.name === defaultProfile"> ★</span></div>
              <button
                v-for="m in (p.models && p.models.length ? p.models : (p.model ? [p.model] : []))"
                :key="p.name + m"
                class="menu-item"
                :class="{ current: p.name === defaultProfile && m === p.model }"
                @click="doSwitchModel(p.name, m)"
              >
                {{ m }}
                <i v-if="p.name === defaultProfile && m === p.model" class="pi pi-check" />
              </button>
            </template>
            <div class="menu-sep" />
            <button class="menu-item" @click="openConfigWindow">
              <i class="pi pi-cog" /> 模型设置…
            </button>
          </div>
          <Transition name="fade">
            <div v-if="modelToast" class="model-toast">{{ modelToast }}</div>
          </Transition>
        </div>
        <label><input v-model="speechEnabled" type="checkbox" @change="changeSpeech" />总结播报</label>
        <Button size="small" text :disabled="isAILoading" @click="newChatSession">新会话</Button>
        <span class="status-pill">{{ statusLabel }}</span>
        <Button icon="pi pi-times" size="small" text class="close-btn" @click="closePanel" />
      </div>
    </div>

    <div class="panel-body">
      <TChat 
        class="custom-chat"
        :data="messageList" 
        layout="both"
        :reverse="false"
        :text-loading="isAILoading"
      />

      <div class="input-area">
        <p v-if="speechNotice" role="status">{{ speechNotice }}</p>
        <section v-if="isVoiceActive || voiceDraft || voiceError" class="voice-panel">
          <div class="voice-panel-header">
            <span>
              <i class="pi pi-microphone" />
              {{ voiceStatusLabel }}
            </span>
            <span v-if="voiceDraft" class="voice-count">{{ voiceDraft.length }} 字</span>
          </div>
          <textarea
            v-model="voiceDraft"
            class="voice-draft"
            rows="3"
            placeholder="录音字幕会显示在这里..."
            :readonly="voiceState === 'recording' || voiceState === 'rewriting'"
          />
          <div v-if="voiceError" class="error-msg">
            <i class="pi pi-exclamation-circle" />
            {{ voiceError }}
          </div>
          <div class="voice-actions">
            <Button
              size="small"
              text
              :disabled="voiceState !== 'recording'"
              @click="stopVoiceInput"
            >
              <i class="pi pi-stop" />
              <span>停止</span>
            </Button>
            <Button
              size="small"
              severity="contrast"
              :disabled="voiceState === 'rewriting' || !canSendVoiceDraft"
              :loading="voiceState === 'rewriting'"
              @click="stopAndRewriteVoice"
            >
              <i class="pi pi-pen-to-square" />
              <span>停止并书面化</span>
            </Button>
          </div>
        </section>

        <div class="input-wrapper">
          <textarea 
            v-model="chatInput" 
            placeholder="问我任何问题..." 
            @keydown.enter.exact.prevent="sendQuestion()"
          />
          <Button 
            class="voice-btn"
            size="small"
            text
            :disabled="isAILoading || voiceState === 'recording' || voiceState === 'rewriting'" 
            @click="startVoiceInput"
          >
            <i class="pi pi-microphone" />
          </Button>
          <Button 
            class="send-btn"
            severity="success" 
            size="small" 
            :disabled="!chatInput.trim() || isAILoading" 
            @click="sendQuestion()"
          >
            <i class="pi pi-send" />
          </Button>
        </div>
      </div>
    </div>
  </main>
</template>

<style lang="scss" scoped>
.chat-panel-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(16, 18, 24, 0.85);
  color: #f3f6fb;
  overflow: hidden;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  -webkit-app-region: drag;
  background: rgba(255, 255, 255, 0.02);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  -webkit-app-region: no-drag;
}

.status-pill {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  padding: 3px 8px;
  background: rgba(15, 23, 42, 0.45);
  font-size: 12px;
  color: rgba(226, 232, 240, 0.72);
}

.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.custom-chat {
  flex: 1;
  min-height: 0;
  background: transparent !important;
  --td-bg-color-container: transparent;
  --td-bg-color-page: transparent;
  --td-text-color-primary: #f3f6fb;
  --td-text-color-secondary: rgba(243, 246, 251, 0.7);
  --td-bg-color-secondarycontainer: rgba(255, 255, 255, 0.05);
  --td-border-level-1-color: rgba(255, 255, 255, 0.1);
  
  :deep(.t-chat__list) {
    padding: 16px;
    min-height: 0;
    box-sizing: border-box;
  }
  
  :deep(.t-chat__inner) {
    margin-bottom: 18px;
  }

  :deep(.t-chat__base) {
    gap: 8px;
    margin-bottom: 4px;
  }

  :deep(.t-chat__name) {
    color: rgba(226, 232, 240, 0.78);
  }

  :deep(.t-chat__time) {
    color: rgba(203, 213, 225, 0.62);
  }

  :deep(.t-chat__inner.user) {
    .t-chat__detail {
      background: #3b82f6;
      color: white;
      border-radius: 12px 12px 2px 12px;
      overflow: hidden;
    }

    .t-chat__text {
      color: white;
    }
  }

  :deep(.t-chat__inner.assistant),
  :deep(.t-chat__inner.error) {
    .t-chat__detail {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px 12px 12px 2px;
      overflow: hidden;
    }
  }

  :deep(.t-chat__inner.error .t-chat__detail) {
    border-color: rgba(248, 113, 113, 0.34);
    background: rgba(127, 29, 29, 0.22);
  }

  :deep(.t-chat__text) {
    color: #f3f6fb;
  }

  :deep(.t-chat__detail-reasoning) {
    background: rgba(247, 204, 138, 0.05);
    border-left: 2px solid #f7cc8a;
    margin-bottom: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: #f7cc8a;
  }
}

.input-area {
  flex-shrink: 0;
  padding: 12px 14px 14px;
  background: rgba(0, 0, 0, 0.2);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.voice-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.55);
}

.voice-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.76);

  span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.voice-count {
  color: rgba(148, 163, 184, 0.72);
}

.voice-draft {
  width: 100%;
  min-height: 68px;
  max-height: 110px;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.44);
  color: rgba(248, 250, 252, 0.95);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  font-family: inherit;

  &::placeholder {
    color: rgba(148, 163, 184, 0.58);
  }
}

.voice-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;

  span {
    margin-left: 4px;
  }
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: flex-end;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 8px 12px;
  transition: all 0.2s;

  &:focus-within {
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.1);
  }
}

.input-wrapper textarea {
  flex: 1;
  background: transparent;
  border: none;
  color: white;
  font-size: 14px;
  line-height: 1.5;
  padding: 4px 0;
  max-height: 120px;
  min-height: 24px;
  outline: none;
  resize: none;
  font-family: inherit;

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
}

.model-switcher { position: relative; }
.model-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 14px;
  border: 1px solid #4b4c55;
  background: #2f3039;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}
.model-dot { width: 7px; height: 7px; border-radius: 50%; background: #3fb96f; }
.model-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: 260px;
  max-height: 380px;
  overflow: auto;
  background: #26272e;
  border: 1px solid #4b4c55;
  border-radius: 10px;
  box-shadow: 0 8px 28px #0009;
  padding: 6px;
}
.menu-group-label { font-size: 11px; color: #8b8d97; padding: 6px 8px 2px; }
.menu-profile { font-size: 11px; color: #a6a8b3; padding: 6px 8px 2px; }
.menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
}
.menu-item:hover { background: #34353e; }
.menu-item.current { color: #8fa7ff; }
.menu-sub { margin-left: auto; color: #8b8d97; font-size: 10px; }
.menu-sep { height: 1px; background: #3a3b44; margin: 6px 4px; }
.model-toast {
  position: fixed;
  bottom: 84px;
  left: 50%;
  transform: translateX(-50%);
  background: #34353e;
  border: 1px solid #4b4c55;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  z-index: 40;
}
.send-btn {
  margin-left: 8px;
  margin-bottom: 2px;
  width: 32px;
  height: 32px;
  padding: 0 !important;
  border-radius: 8px !important;
}

.voice-btn {
  margin-left: 8px;
  margin-bottom: 2px;
  width: 32px;
  height: 32px;
  padding: 0 !important;
  border-radius: 8px !important;
  color: rgba(226, 232, 240, 0.72) !important;

  &:hover,
  &:focus-visible,
  &:active {
    color: #111827 !important;
  }
}

.error-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f87171;
  font-size: 12px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(248, 113, 113, 0.2);
}

/* 深色模式适配 */
.app-dark {
  .chat-panel-container {
    background: rgba(10, 12, 16, 0.9);
  }
}

/* 隐藏滚动条但保留功能 */
::-webkit-scrollbar {
  width: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
