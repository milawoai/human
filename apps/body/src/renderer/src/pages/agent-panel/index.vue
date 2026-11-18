<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import type { IpcProxy } from '@renderer/plugin/ipc'
import { applyAgentEvent, readAgentMessage, readRunObservation } from '@shared/agent-panel'
import type { AgentPanelState } from '@shared/agent-panel'
import { readSpeechPreference, saveSpeechPreference, playSessionSpeech } from '@shared/session-speech'

const ipc = inject<IpcProxy>('ipc')!
const state = reactive<AgentPanelState>({ sessionId: crypto.randomUUID(), requestId: '', messages: [], tools: [], status: 'idle', error: '' })
const sessions = ref<any[]>([])
const task = ref('')
const profile = ref('')
const toolPreset = ref('none')
const busy = ref(false)
const loading = ref(false)
const notice = ref('')
const speechEnabled = ref(false)
const speechNotice = ref('')
let speechEpoch = 0
const updatePlayback = (token = '') => { void ipc.live2d.setSpeechPlaybackState({ scope: 'agent-panel', token }).catch(() => {}) }
const beforeUnloadSpeech = () => { ++speechEpoch; updatePlayback() }
function changeSpeech() {
  ++speechEpoch
  updatePlayback()
  speechNotice.value = ''
  try { saveSpeechPreference(localStorage, state.sessionId, speechEnabled.value) }
  catch { speechEnabled.value = false; speechNotice.value = '无法保存播报设置，已保持关闭' }
}
const log = ref<HTMLElement>()
let disposed = false
let loadId = 0
let pollTimer: ReturnType<typeof setTimeout> | undefined
let querying = false
let submittingRunId = ''
const rememberSession = () => { try { localStorage.setItem('human:agent:last-session', state.sessionId) } catch {} }
const statusLabel = computed(() => ({ idle: '等待任务', running: '运行中', cancelling: '正在取消', cancelled: '已取消', unknown: '状态未知', done: '已完成', error: '执行失败' })[state.status])
const scrollEnd = async () => { await nextTick(); if (log.value) log.value.scrollTop = log.value.scrollHeight }

const onEvent = (_event: unknown, payload: any) => {
  if (!busy.value) return
  applyAgentEvent(state, payload)
  void scrollEnd()
}
const onNotice = (_event: unknown, message: string) => { notice.value = message }

async function refreshSessions() {
  const result = await ipc.agent.listSessions()
  if (disposed) return
  if (!result.success) throw new Error(result.msg || '加载会话失败')
  sessions.value = Array.isArray(result.data?.sessions) ? result.data.sessions : []
}

async function loadSession(sessionId: string, finalRefresh = false) {
  if (busy.value && !finalRefresh) return
  const id = ++loadId
  loading.value = true
  try {
    const result = await ipc.agent.getSession({ sessionId })
    if (disposed || id !== loadId) return
    if (!result.success) throw new Error(result.msg || '读取会话失败')
    state.sessionId = sessionId
    rememberSession()
    if (!finalRefresh) {
      ++speechEpoch
      updatePlayback()
      speechEnabled.value = readSpeechPreference(localStorage, sessionId, result.data?.speechSummaryEnabled === true)
      speechNotice.value = ''
    }
    state.messages = (result.data?.messages || []).map(readAgentMessage)
    state.activeMessage = undefined
    if (!finalRefresh) {
      state.tools = []
      state.requestId = ''
      state.error = result.data?.lastError || ''
      state.status = state.error ? 'error' : 'idle'
      profile.value = result.data?.profileName || ''
      toolPreset.value = 'none'
    }
    await scrollEnd()
  } finally { if (id === loadId) loading.value = false }
}

function newSession() {
  if (busy.value || loading.value) return
  ++loadId
  Object.assign(state, { sessionId: crypto.randomUUID(), requestId: '', messages: [], tools: [], status: 'idle', error: '', activeMessage: undefined })
  task.value = ''
  ++speechEpoch
  speechEnabled.value = false
  updatePlayback()
  speechNotice.value = ''
  toolPreset.value = 'none'
  notice.value = ''
  rememberSession()
}

async function checkRun() {
  if (querying || disposed) return
  querying = true
  const sessionId = state.sessionId
  const runId = state.requestId
  try {
    const result = await ipc.agent.getRun({ sessionId, ...(runId ? { runId } : {}) })
    if (disposed || sessionId !== state.sessionId || runId !== state.requestId) return
    if (!result.success) throw new Error(result.msg || '查询运行状态失败')
    const observed = readRunObservation(result.data, sessionId, runId)
    if (!observed) return
    if (observed.status === 'unknown' && submittingRunId === runId && runId) {
      notice.value = '后端尚无此运行记录；请求仍等待中，不会自动重发。'
      return
    }
    const wasBusy = busy.value
    busy.value = observed.busy
    state.status = observed.status
    state.requestId = observed.runId
    state.error = observed.error
    if (observed.status === 'unknown') notice.value = '后端未找到运行记录（可能重启或记录已过期），无法确认此前任务结果；不要直接重发写任务。'
    else if (observed.status === 'cancelling') notice.value = '已请求取消，等待执行真正结束；不能撤销已经完成的工具操作。'
    else if (observed.status === 'cancelled') notice.value = '执行已结束；取消不能撤销之前的副作用。'
    if (wasBusy && !observed.busy && observed.status !== 'unknown') {
      try { await loadSession(sessionId, true) }
      catch { notice.value = '已确认运行结束，但没有可恢复的会话历史（可能在初始化阶段失败）。' }
      await refreshSessions()
    }
  } catch (error) {
    if (!disposed && sessionId === state.sessionId) notice.value = `无法确认后端状态：${String(error)}；不会自动重发任务。`
  } finally { querying = false }
}

async function cancelRun() {
  if (!state.requestId || !busy.value) return
  const sessionId = state.sessionId, runId = state.requestId
  ++speechEpoch
  updatePlayback()
  try {
    const result = await ipc.agent.cancelRun({ sessionId, runId })
    if (!result.success) throw new Error(result.msg || '取消请求失败')
    if (!disposed && state.sessionId === sessionId && state.requestId === runId) await checkRun()
  } catch (error) { notice.value = `未确认取消：${String(error)}` }
}

function schedulePoll() {
  pollTimer = setTimeout(async () => {
    if (disposed) return
    if (busy.value) await checkRun()
    schedulePoll()
  }, 2000)
}

async function submit() {
  if (busy.value || loading.value || !task.value.trim()) return
  const text = task.value.trim()
  const sessionId = state.sessionId
  const runId = crypto.randomUUID()
  const ownsRun = () => !disposed && state.sessionId === sessionId && state.requestId === runId
  const epoch = ++speechEpoch
  const narrate = speechEnabled.value
  const speechPlayback = { scope: 'agent-panel', token: crypto.randomUUID() }
  updatePlayback(narrate ? speechPlayback.token : '')
  const currentSpeech = () => !disposed && state.sessionId === sessionId && speechEpoch === epoch && speechEnabled.value && narrate
  speechNotice.value = ''
  busy.value = true
  state.requestId = runId
  submittingRunId = runId
  rememberSession()
  try { localStorage.setItem('human:agent:last-run', JSON.stringify({ sessionId, runId })) } catch {}
  state.activeMessage = undefined
  state.status = 'running'
  state.error = ''
  state.tools = []
  notice.value = ''
  state.messages.push(readAgentMessage({ role: 'user', content: text }))
  task.value = ''
  void scrollEnd()
  try {
    const result = await ipc.agent.run({ sessionId, runId, userText: text, profileName: profile.value, toolPreset: toolPreset.value, speechSummaryEnabled: narrate })
    if (!ownsRun()) return
    if (!result.success) throw new Error(result.msg || 'Agent 执行失败')
    state.status = result.data?.runStatus === 'cancelled' ? 'cancelled' : state.error ? 'error' : 'done'
    await loadSession(sessionId, true)
    if (currentSpeech() && result.data?.runStatus !== 'cancelled') {
      const message = result.data?.speech ? await playSessionSpeech(result.data.speech, currentSpeech, payload => ipc.live2d.perform({ ...payload, speechPlayback })) : '本轮未生成有效的播报摘要，已保留文字回复'
      if (currentSpeech()) speechNotice.value = message
    }
  } catch (error) {
    if (ownsRun()) {
      notice.value = `请求未正常返回：${String(error)}；正在检查实际状态，不会自动重发。`
      submittingRunId = ''
      await checkRun()
    }
  } finally {
    if (submittingRunId === runId) submittingRunId = ''
    if (ownsRun()) {
      await checkRun()
      try { await refreshSessions() } catch (error) { notice.value = String(error) }
    }
  }
}

async function selectSession(event: Event) {
  const sessionId = (event.target as HTMLSelectElement).value
  if (!sessionId) return
  try { await loadSession(sessionId); await checkRun() } catch (error) { state.error = String(error) }
}

onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnloadSpeech)
  window.electron.ipcRenderer.on('agent:event', onEvent)
  window.electron.ipcRenderer.on('agent:notice', onNotice)
  try { await refreshSessions() } catch (error) { notice.value = String(error) }
  try {
    const remembered = localStorage.getItem('human:agent:last-session')
    if (remembered && /^[a-zA-Z0-9_-]{1,128}$/.test(remembered)) {
      state.sessionId = remembered
      // An active first run may not have a persisted history file yet.
      try { await loadSession(remembered) } catch { /* query live ownership below */ }
      try {
        const saved = JSON.parse(localStorage.getItem('human:agent:last-run') || 'null')
        if (saved?.sessionId === remembered && /^[a-zA-Z0-9_-]{1,128}$/.test(saved.runId || '')) state.requestId = saved.runId
      } catch { /* corrupt storage must not prevent live status queries */ }
      await checkRun()
    }
  } catch { /* local storage is optional */ }
  schedulePoll()
})
onUnmounted(() => {
  window.removeEventListener('beforeunload', beforeUnloadSpeech)
  disposed = true
  clearTimeout(pollTimer)
  ++speechEpoch
  updatePlayback()
  window.electron.ipcRenderer.off('agent:event', onEvent)
  window.electron.ipcRenderer.off('agent:notice', onNotice)
})
</script>

<template>
  <main class="agent-panel">
    <header><div><h1>Agent 测试</h1><p>Pi Agent · 模型推理与工具调用循环</p></div><span role="status" :class="state.status">{{ statusLabel }}</span></header>
    <section class="controls" aria-label="会话与模型">
      <button :disabled="busy || loading" @click="newSession">新会话</button>
      <button :disabled="loading" @click="checkRun">检查运行状态</button>
      <select aria-label="恢复会话" :disabled="busy || loading" :value="sessions.some(s => s.sessionId === state.sessionId) ? state.sessionId : ''" @change="selectSession">
        <option value="">恢复最近会话…</option>
        <option v-for="s in sessions" :key="s.sessionId" :value="s.sessionId">{{ s.lastUserText?.slice(0, 40) || s.sessionId }}</option>
      </select>
      <input v-model="profile" aria-label="模型 profile" placeholder="模型 profile（留空使用默认）" :disabled="busy || loading" />
      <select v-model="toolPreset" aria-label="工具模式" :disabled="busy || loading">
        <option value="none">不使用工具（默认）</option><option value="default">全部已注册工具</option><option value="coding_only">编码与会话工具</option>
      </select>
      <label><input v-model="speechEnabled" type="checkbox" :disabled="loading" @change="changeSpeech" />回复总结播报</label>
    </section>
    <p class="session-id">会话 {{ state.sessionId }}</p>
    <p v-if="toolPreset !== 'none'" class="warning">已允许模型调用所选工具，可能修改文件或运行命令。请仅执行你信任的测试任务。</p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="speechNotice" class="notice" role="status">{{ speechNotice }}</p>
    <p v-if="state.error" role="alert" class="error">{{ state.error }}</p>
    <section ref="log" class="messages" aria-label="Agent 执行记录" aria-live="polite">
      <p v-if="!state.messages.length" class="empty">先发送一个简单任务验证模型连接，再开启工具测试。支持多轮对话和历史会话恢复。</p>
      <article v-for="(message, index) in state.messages" :key="index" :class="['message', message.role]">
        <strong>{{ message.role === 'user' ? '你' : message.role === 'assistant' ? 'Agent' : message.role === 'system' ? '系统' : '工具结果' }}</strong>
        <details v-if="message.thinking"><summary>模型思考</summary><pre>{{ message.thinking }}</pre></details>
        <pre>{{ message.text || (busy ? '处理中…' : '（无文本内容）') }}</pre>
      </article>
      <section v-if="state.tools.length" class="tools" aria-label="工具执行过程">
        <h2>本轮工具执行</h2>
        <details v-for="tool in state.tools" :key="tool.id" :open="tool.status === 'running'">
          <summary>{{ tool.name }} · {{ { running: '执行中', done: '完成', error: '失败' }[tool.status] }}</summary>
          <pre>参数：{{ tool.args }}\n结果：{{ tool.result }}</pre>
        </details>
      </section>
    </section>
    <form @submit.prevent="submit">
      <textarea v-model="task" aria-label="Agent 任务" placeholder="输入任务；Ctrl / ⌘ + Enter 发送" maxlength="32000" :disabled="busy || loading" @keydown.enter="($event.ctrlKey || $event.metaKey) && ($event.preventDefault(), submit())" />
      <div class="footer"><small>取消需等待执行结束；后端重启不支持恢复执行。</small><button v-if="busy" type="button" :disabled="!state.requestId || state.status === 'cancelling'" @click="cancelRun">{{ state.status === 'cancelling' ? '等待取消…' : '停止任务' }}</button><button type="submit" :disabled="busy || loading || !task.trim()">{{ busy ? '执行中…' : '发送任务' }}</button></div>
    </form>
  </main>
</template>

<style scoped>
.agent-panel { height:100vh; box-sizing:border-box; display:flex; flex-direction:column; gap:var(--human-space-section); padding: var(--human-space-page); color:var(--human-text); background: var(--human-bg); font:var(--human-text-base)/var(--human-line-height) var(--human-font-body); }
header, .controls, .footer { display: flex; align-items: center; justify-content: space-between; gap: var(--human-spacing-2); }
h1 { margin:0; font-size:var(--human-text-title); } h2 { font-size:var(--human-text-md); } p { margin:0; } header p, small, .session-id { color:var(--human-text-muted); } .session-id { font-size:var(--human-text-sm); }
.controls { flex-wrap: wrap; justify-content: flex-start; } input { flex: 1; min-width: 160px; } select { max-width: 280px; }
button, input, select, textarea { font:inherit; border:1px solid var(--human-border); border-radius: var(--human-radius-control); padding:var(--human-space-control-y) var(--human-space-control-x); background:var(--human-surface); color:inherit; } button { cursor:pointer; } button:disabled { opacity:.45; cursor:default; }
button[type=submit] { background:var(--human-accent-strong); color:var(--human-on-accent); flex-shrink:0; } :focus-visible { outline:2px solid var(--human-accent); outline-offset:2px; }
.messages { flex:1; min-height:80px; overflow:auto; } .message { margin-bottom:var(--human-spacing-3); padding:var(--human-spacing-3); border-radius: var(--human-radius-md); background:var(--human-surface); } .message.user { background:var(--human-accent-soft); }
pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; margin:var(--human-spacing-2) 0 0; } details { margin-top:var(--human-spacing-2); } summary { cursor:pointer; color:var(--human-accent); }
.empty { padding:var(--human-spacing-6) var(--human-spacing-2); color:var(--human-text-muted); text-align:center; } .tools { border-top:1px solid var(--human-border); padding:var(--human-spacing-2); }
.warning { color:var(--human-warning); } .error { color:var(--human-danger); white-space:pre-wrap; } .notice { color:var(--human-accent); }
textarea { resize:vertical; box-sizing:border-box; width:100%; min-height:80px; max-height:180px; } .footer { margin-top:var(--human-spacing-2); } .running { color:var(--human-warning); } .done { color:var(--human-success); }
</style>
