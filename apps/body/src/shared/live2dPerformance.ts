export interface Live2DPerformancePayload {
  text?: string
  motion?: {
    group: string
    index?: number
  }
  expression?: string
  audioUrl?: string
  speechPlayback?: { scope: string; token: string }
}

export type Live2DPerformanceResult =
  | {
      success: true
      payload: Live2DPerformancePayload
    }
  | {
      success: false
      error: string
    }

const trimString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export const parseLive2DPerformancePayload = (
  input: unknown
): Live2DPerformanceResult => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { success: false, error: 'payload 必须是对象' }
  }

  const raw = input as Record<string, unknown>
  const payload: Live2DPerformancePayload = {}
  const text = trimString(raw.text)
  const expression = trimString(raw.expression)
  const audioUrl = trimString(raw.audioUrl)
  if (raw.speechPlayback !== undefined) {
    const ticket = raw.speechPlayback as { scope?: unknown; token?: unknown }
    if (!ticket || !['chat-panel', 'agent-panel'].includes(String(ticket.scope)) || typeof ticket.token !== 'string' || !ticket.token || ticket.token.length > 200) {
      return { success: false, error: 'speechPlayback 不合法' }
    }
    payload.speechPlayback = { scope: String(ticket.scope), token: ticket.token }
  }

  if (text) payload.text = text
  if (expression) payload.expression = expression
  if (audioUrl) payload.audioUrl = audioUrl

  if (raw.motion !== undefined) {
    if (!raw.motion || typeof raw.motion !== 'object' || Array.isArray(raw.motion)) {
      return { success: false, error: 'motion 必须是对象' }
    }

    const motion = raw.motion as Record<string, unknown>
    const group = trimString(motion.group)
    if (!group) {
      return { success: false, error: 'motion.group 必须是非空 string' }
    }

    const index = motion.index === undefined ? 0 : motion.index
    if (!Number.isInteger(index) || Number(index) < 0) {
      return { success: false, error: 'motion.index 必须是非负整数' }
    }

    payload.motion = {
      group,
      index: Number(index)
    }
  }

  if (!payload.text && !payload.motion && !payload.expression && !payload.audioUrl) {
    return {
      success: false,
      error: 'payload 至少包含 text、motion、expression、audioUrl 中的一项'
    }
  }

  return {
    success: true,
    payload
  }
}
