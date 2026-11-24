export type CompanionConversationStatus = 'pending' | 'available' | 'unavailable'

export interface CompanionConversation {
  conversationId: string
  conversationType: 'companion'
  status: CompanionConversationStatus
  title?: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
}

export interface CompanionTranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface CompanionQuestionInput {
  conversationId: string
  question: string
  requestId?: string
  speechSummaryEnabled?: boolean
}

export interface CompanionConversationApi {
  current: () => Promise<any>
  create: () => Promise<any>
  transcript: (conversationId: string) => Promise<any>
}

export type ConfirmedQuestionAction = 'queue' | 'draft' | 'submit'

export function getConfirmedQuestionAction(input: {
  hasConversation: boolean
  restoring: boolean
  busy: boolean
}): ConfirmedQuestionAction {
  if (!input.hasConversation || input.restoring) return 'queue'
  if (input.busy) return 'draft'
  return 'submit'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function unwrap(response: any): any {
  if (!response?.success) throw new Error(response?.msg || '会话请求失败')
  if (!response.data || typeof response.data !== 'object') throw new Error('后端未返回会话数据')
  return response.data
}

function normalizeConversation(value: any): CompanionConversation {
  if (!value || !UUID.test(value.conversationId) || value.conversationType !== 'companion') {
    throw new Error('后端返回了无效的会话')
  }
  if (!['pending', 'available', 'unavailable'].includes(value.status)) {
    throw new Error('后端返回了未知的会话状态')
  }
  return {
    conversationId: value.conversationId,
    conversationType: 'companion',
    status: value.status,
    ...(typeof value.title === 'string' && value.title ? { title: value.title } : {}),
    createdAt: Number(value.createdAt) || 0,
    updatedAt: Number(value.updatedAt) || 0,
    lastOpenedAt: Number(value.lastOpenedAt) || 0
  }
}

export function readConversation(response: any): CompanionConversation {
  return normalizeConversation(unwrap(response).conversation)
}

export function readCurrentConversation(response: any): CompanionConversation | null {
  const value = unwrap(response).conversation
  return value === null ? null : normalizeConversation(value)
}

export function readCompanionTranscript(response: any, conversationId: string): CompanionTranscriptMessage[] {
  const data = unwrap(response)
  if (data.conversationId !== conversationId) throw new Error('会话历史与当前会话不匹配')
  if (!Array.isArray(data.messages)) throw new Error('后端未返回会话历史')
  return data.messages.flatMap((message: any) => {
    if (!['user', 'assistant'].includes(message?.role) || typeof message.content !== 'string') return []
    return [{
      id: String(message.id || crypto.randomUUID()),
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp: Number(message.timestamp) || 0
    }]
  })
}

export function buildCompanionQuestionPayload(input: CompanionQuestionInput) {
  if (!UUID.test(input.conversationId)) throw new Error('会话 ID 不合法')
  const question = typeof input.question === 'string' ? input.question.trim() : ''
  if (!question) throw new Error('问题为空，无法提交')
  return {
    type: 'confirmed',
    conversationId: input.conversationId,
    sessionId: input.conversationId,
    requestId: input.requestId || crypto.randomUUID(),
    confirmedQuestion: question,
    speechSummaryEnabled: input.speechSummaryEnabled === true,
    source: 'body.chat-panel'
  }
}

export async function createFreshCompanionConversation(create: () => Promise<any>): Promise<CompanionConversation> {
  return readConversation(await create())
}

export async function loadCompanionConversation(api: CompanionConversationApi): Promise<{
  conversation: CompanionConversation
  messages: CompanionTranscriptMessage[]
}> {
  const current = readCurrentConversation(await api.current())
  const conversation = current ?? await createFreshCompanionConversation(api.create)
  const messages = readCompanionTranscript(await api.transcript(conversation.conversationId), conversation.conversationId)
  return { conversation, messages }
}
