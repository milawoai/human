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
  BRAIN_INIT: 'brain.init',
  BRAIN_CORTEX_CHAT: 'brain.cortex.chat',
  BRAIN_LANGUAGE_MODELS: 'brain.language.models',
} as const

// ──────────────────────────────────────────────
// Topics
// ──────────────────────────────────────────────

export const TOPIC = {
  // control
  SENSORY_HEARING_ENABLE: 'sensory.hearing.caption_stream.enable',
  SENSORY_HEARING_DISABLE: 'sensory.hearing.caption_stream.disable',
  // query
  SENSORY_HEARING_ASR_MODELS: 'sensory.hearing.caption_stream.asr_models',
  // event
  SENSORY_HEARING_PREPARED: 'sensory.hearing.caption_stream.prepared',
  SENSORY_HEARING_STARTED: 'sensory.hearing.caption_stream.started',
  SENSORY_HEARING_VAD_START: 'sensory.hearing.caption_stream.vad_start',
  SENSORY_HEARING_VAD_END: 'sensory.hearing.caption_stream.vad_end',
  SENSORY_HEARING_SEGMENT: 'sensory.hearing.caption_stream.segment',
  SENSORY_HEARING_STOPPED: 'sensory.hearing.caption_stream.stopped',
  SENSORY_HEARING_ERROR: 'sensory.hearing.caption_stream.error',
  // brain.init — command & event
  BRAIN_INIT_EXECUTE: 'brain.init.execute',
  BRAIN_INIT_DONE: 'brain.init.init_done',
  BRAIN_INIT_ERROR: 'brain.init.init_error',
  // brain.cortex.chat — command
  BRAIN_CORTEX_CHAT_COMPLETE: 'brain.cortex.chat.complete',
  BRAIN_CORTEX_CHAT_STREAM: 'brain.cortex.chat.stream',
  // brain.language.models — query/control
  BRAIN_LANGUAGE_MODELS_LIST: 'brain.language.models.list',
  BRAIN_LANGUAGE_MODELS_VALIDATE: 'brain.language.models.validate',
  BRAIN_LANGUAGE_MODEL_SWITCH: 'brain.language.model.switch',
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
  BRAIN: {
    actorId: 'brain-main',
    runtime: 'nest' as const,
    system: 'brain' as const,
    module: 'init',
  },
  BRAIN_CORTEX: {
    actorId: 'brain-main',
    runtime: 'nest' as const,
    system: 'brain' as const,
    module: 'cortex',
  },
  BRAIN_LANGUAGE: {
    actorId: 'brain-main',
    runtime: 'nest' as const,
    system: 'brain' as const,
    module: 'language-center',
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
  SENSORY_HEARING_ASR_MODELS: {
    id: 'sensory.hearing.caption_stream.asr_models',
    actor: ACTOR.SENSORY_HEARING,
    topic: TOPIC.SENSORY_HEARING_ASR_MODELS,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_INIT: {
    id: 'brain.init',
    actor: ACTOR.BRAIN,
    topic: TOPIC.BRAIN_INIT_EXECUTE,
    kinds: ['command'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_CORTEX_CHAT_COMPLETE: {
    id: 'brain.cortex.chat.complete',
    actor: ACTOR.BRAIN_CORTEX,
    topic: TOPIC.BRAIN_CORTEX_CHAT_COMPLETE,
    kinds: ['command'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_CORTEX_CHAT_STREAM: {
    id: 'brain.cortex.chat.stream',
    actor: ACTOR.BRAIN_CORTEX,
    topic: TOPIC.BRAIN_CORTEX_CHAT_STREAM,
    kinds: ['command'] as const,
    mode: 'stream' as const,
    enabled: true,
    online: true,
  },
  BRAIN_LANGUAGE_MODELS_LIST: {
    id: 'brain.language.models.list',
    actor: ACTOR.BRAIN_LANGUAGE,
    topic: TOPIC.BRAIN_LANGUAGE_MODELS_LIST,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_LANGUAGE_MODELS_VALIDATE: {
    id: 'brain.language.models.validate',
    actor: ACTOR.BRAIN_LANGUAGE,
    topic: TOPIC.BRAIN_LANGUAGE_MODELS_VALIDATE,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_LANGUAGE_MODEL_SWITCH: {
    id: 'brain.language.model.switch',
    actor: ACTOR.BRAIN_LANGUAGE,
    topic: TOPIC.BRAIN_LANGUAGE_MODEL_SWITCH,
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
