export interface AgentRunInput {
  runId?: string
  sessionId: string
  userText: string
  profileName?: string
  toolPreset?: string
  speechSummaryEnabled?: boolean
}

export interface AgentDisplayMessage {
  role: string
  text: string
  thinking: string
}

export interface AgentToolDisplay {
  id: string
  name: string
  args: string
  result: string
  status: 'running' | 'done' | 'error'
}

export interface AgentPanelState {
  sessionId: string
  requestId: string
  messages: AgentDisplayMessage[]
  tools: AgentToolDisplay[]
  status: 'idle' | 'running' | 'cancelling' | 'cancelled' | 'unknown' | 'done' | 'error'
  error: string
  activeMessage?: number
}

export function buildAgentRequest(input: AgentRunInput) {
  if (input.runId && !/^[a-zA-Z0-9_-]{1,128}$/.test(input.runId)) throw new Error('运行 ID 不合法')
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.sessionId || '')) throw new Error('会话 ID 不合法')
  const userText = typeof input.userText === 'string' ? input.userText.trim() : ''
  if (!userText || userText.length > 32_000) throw new Error('请输入任务，最多 32000 字')
  const toolPreset = input.toolPreset ?? 'none'
  if (!['none', 'default', 'coding_only'].includes(toolPreset)) throw new Error('工具模式不合法')
  const profileName = input.profileName?.trim()
  return { sessionId: input.sessionId, userText, toolPreset, ...(input.runId ? { runId: input.runId } : {}), ...(profileName ? { profileName } : {}),
    ...(typeof input.speechSummaryEnabled === 'boolean' ? { speechSummaryEnabled: input.speechSummaryEnabled } : {}) }
}

export function readRunObservation(data: any, sessionId: string, runId = '') {
  if (!data || typeof data !== 'object') throw new Error('无效的运行查询响应')
  const run = data.run
  if (!run && data.status === 'unknown') return { busy: false, status: 'unknown' as const, runId, error: '' }
  if (!run || run.sessionId !== sessionId || (runId && run.runId !== runId)) return null
  const statuses = { running: 'running', cancelling: 'cancelling', succeeded: 'done', failed: 'error', cancelled: 'cancelled' } as const
  if (!(run.status in statuses)) throw new Error('未知的运行状态')
  return { busy: ['running', 'cancelling'].includes(run.status), status: statuses[run.status as keyof typeof statuses], runId: String(run.runId), error: run.error || '' }
}

export function unwrapAgentResponse(response: any, allowLastError = false): any {
  if (!response?.success) throw new Error(response?.msg || 'Agent 请求失败')
  if (!response.data || typeof response.data !== 'object') throw new Error('后端未返回执行结果，请确认 Agent 能力已注册')
  if (!allowLastError && response.data.lastError) throw new Error(response.data.lastError)
  return response.data
}

export function agentDisplayJson(value: unknown): string {
  return (typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2)).slice(0, 20_000)
}

export function readAgentMessage(message: any): AgentDisplayMessage {
  const content = message?.content
  const blocks = Array.isArray(content) ? content : []
  return {
    role: String(message?.role || 'assistant'),
    text: typeof content === 'string' ? content : blocks.map((b: any) => {
      if (b.type === 'text') return b.text || ''
      if (b.type === 'toolCall') return `[调用 ${b.name}]\n${agentDisplayJson(b.arguments)}`
      if (b.type === 'image') return '[图片]'
      return ''
    }).filter(Boolean).join('\n'),
    thinking: blocks.filter((b: any) => b.type === 'thinking').map((b: any) => b.thinking || '').join('\n')
  }
}

/** Pi message_update carries a complete snapshot; never append the same delta twice. */
export function applyAgentEvent(state: AgentPanelState, payload: any): void {
  if (payload?.sessionId !== state.sessionId || !payload?.requestId) return
  if (state.requestId && payload.requestId !== state.requestId) return
  state.requestId = payload.requestId
  const event = payload.event
  if (!event?.type) return
  if (['message_start', 'message_update', 'message_end'].includes(event.type) && event.message?.role === 'assistant') {
    if (event.type === 'message_start' || state.activeMessage === undefined) {
      state.activeMessage = state.messages.length
      state.messages.push(readAgentMessage(event.message))
    } else {
      state.messages[state.activeMessage] = readAgentMessage(event.message)
    }
    if (event.message.errorMessage) {
      state.error = event.message.errorMessage
      state.status = 'error'
    }
    if (event.type === 'message_end') state.activeMessage = undefined
  }
  if (event.type.startsWith('tool_execution_')) {
    let tool = state.tools.find((item) => item.id === event.toolCallId)
    if (!tool) {
      tool = { id: event.toolCallId, name: event.toolName, args: agentDisplayJson(event.args), result: '', status: 'running' }
      state.tools.push(tool)
    }
    if (event.type === 'tool_execution_update') tool.result = agentDisplayJson(event.partialResult)
    if (event.type === 'tool_execution_end') {
      tool.result = agentDisplayJson(event.result)
      tool.status = event.isError ? 'error' : 'done'
    }
  }
  if (event.type === 'agent_end') state.status = state.error ? 'error' : 'done'
}
