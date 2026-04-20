/**
 * Neural Topics — TS 常量导出
 *
 * 与 topics.json 手动保持同步。
 * 所有 Neural Core topic 字符串的唯一 TS 来源。
 */

// ──────────────────────────────────────────────
// Namespaces
// ──────────────────────────────────────────────

export const NS = {
  SENSORY_HEARING: 'sensory.hearing.caption_stream',
} as const

// ──────────────────────────────────────────────
// Topics
// ──────────────────────────────────────────────

export const TOPIC = {
  // control
  SENSORY_HEARING_ENABLE: 'sensory.hearing.caption_stream.enable',
  SENSORY_HEARING_DISABLE: 'sensory.hearing.caption_stream.disable',
  // event
  SENSORY_HEARING_PREPARED: 'sensory.hearing.caption_stream.prepared',
  SENSORY_HEARING_STARTED: 'sensory.hearing.caption_stream.started',
  SENSORY_HEARING_VAD_START: 'sensory.hearing.caption_stream.vad_start',
  SENSORY_HEARING_VAD_END: 'sensory.hearing.caption_stream.vad_end',
  SENSORY_HEARING_SEGMENT: 'sensory.hearing.caption_stream.segment',
  SENSORY_HEARING_STOPPED: 'sensory.hearing.caption_stream.stopped',
  SENSORY_HEARING_ERROR: 'sensory.hearing.caption_stream.error',
} as const

// ──────────────────────────────────────────────
// Subscribe patterns
// ──────────────────────────────────────────────

export const SUB = {
  SENSORY_HEARING_ALL: 'sensory.hearing.caption_stream.*',
} as const

// ──────────────────────────────────────────────
// Actor definitions
// ──────────────────────────────────────────────

export const ACTOR = {
  SENSORY_HEARING: {
    actorId: 'sensory-hearing',
    runtime: 'python' as const,
    system: 'sensory' as const,
    module: 'hearing',
  },
} as const

// ──────────────────────────────────────────────
// Capabilities
// ──────────────────────────────────────────────

export const CAP = {
  SENSORY_HEARING_STREAM: {
    id: 'sensory.hearing.caption_stream',
    actor: ACTOR.SENSORY_HEARING,
    topic: TOPIC.SENSORY_HEARING_ENABLE,
    kinds: ['control'] as const,
    mode: 'stream' as const,
    enabled: true,
    online: true,
  },
  SENSORY_HEARING_STOP: {
    id: 'sensory.hearing.caption_stream.stop',
    actor: ACTOR.SENSORY_HEARING,
    topic: TOPIC.SENSORY_HEARING_DISABLE,
    kinds: ['control'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
} as const

// ──────────────────────────────────────────────
// Event type → topic 映射
// ──────────────────────────────────────────────

export const EVENT_TOPIC: Record<string, string> = {
  prepared: TOPIC.SENSORY_HEARING_PREPARED,
  started: TOPIC.SENSORY_HEARING_STARTED,
  vad_start: TOPIC.SENSORY_HEARING_VAD_START,
  vad_end: TOPIC.SENSORY_HEARING_VAD_END,
  segment_ready: TOPIC.SENSORY_HEARING_SEGMENT,
  stopped: TOPIC.SENSORY_HEARING_STOPPED,
  error: TOPIC.SENSORY_HEARING_ERROR,
}

// ──────────────────────────────────────────────
// 便捷方法
// ──────────────────────────────────────────────

export function isTopicInNamespace(topic: string, ns: string): boolean {
  return topic.startsWith(ns + '.')
}

export function isCaptionStreamTopic(topic: string): boolean {
  return isTopicInNamespace(topic, NS.SENSORY_HEARING)
}
