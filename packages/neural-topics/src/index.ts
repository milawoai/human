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
  SENSORY_HEARING_QUESTION: 'sensory.hearing.question',
  MOTOR_ANIMATION: 'motor.animation.focused_app',
  BRAIN_INIT: 'brain.init',
  BRAIN_CORTEX_CHAT: 'brain.cortex.chat',
  BRAIN_CORTEX_REWRITE: 'brain.cortex.rewrite',
  BRAIN_CORTEX_ANSWER: 'brain.cortex.answer',
  BRAIN_LANGUAGE_MODELS: 'brain.language.models',
  BRAIN_LANGUAGE_OAUTH: 'brain.language.oauth',
  BRAIN_AGENT: 'brain.agent',
  BRAIN_HIPPOCAMPUS_MEMORY: 'brain.hippocampus.memory',
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
  SENSORY_HEARING_QUESTION_FINALIZED: 'sensory.hearing.question.finalized',
  // motor.animation.focused_app — command
  MOTOR_ANIMATION_INPUT_TEXT_TO_FOCUSED_APP: 'motor.animation.focused_app.input_text',
  // brain.init — command & event
  BRAIN_INIT_EXECUTE: 'brain.init.execute',
  BRAIN_INIT_DONE: 'brain.init.init_done',
  BRAIN_INIT_ERROR: 'brain.init.init_error',
  // brain.cortex.chat — command
  BRAIN_CORTEX_CHAT_COMPLETE: 'brain.cortex.chat.complete',
  BRAIN_CORTEX_CHAT_STREAM: 'brain.cortex.chat.stream',
  BRAIN_CORTEX_REWRITE_REQUESTED: 'brain.cortex.rewrite.requested',
  BRAIN_CORTEX_REWRITE_COMPLETED: 'brain.cortex.rewrite.completed',
  BRAIN_CORTEX_ASK_REQUESTED: 'brain.cortex.ask.requested',
  BRAIN_CORTEX_ANSWER_STREAM_THINK: 'brain.cortex.answer.stream.think',
  BRAIN_CORTEX_ANSWER_STREAM_CHUNK: 'brain.cortex.answer.stream.chunk',
  BRAIN_CORTEX_ANSWER_COMPLETED: 'brain.cortex.answer.completed',
  BRAIN_CORTEX_ANSWER_FAILED: 'brain.cortex.answer.failed',
  // brain.language.models — query/control
  BRAIN_LANGUAGE_MODELS_LIST: 'brain.language.models.list',
  BRAIN_LANGUAGE_MODELS_VALIDATE: 'brain.language.models.validate',
  BRAIN_LANGUAGE_MODEL_SWITCH: 'brain.language.model.switch',
  // brain.language.oauth — query/command
  BRAIN_LANGUAGE_OAUTH_PROVIDERS: 'brain.language.oauth.providers',
  BRAIN_LANGUAGE_OAUTH_LOGIN: 'brain.language.oauth.login',
  // brain.agent — command/query/event
  BRAIN_AGENT_RUN: 'brain.agent.run',
  BRAIN_AGENT_CODING_RUN: 'brain.agent.coding.run',
  BRAIN_AGENT_RUN_EVENT: 'brain.agent.run.event',
  BRAIN_AGENT_SESSION_GET: 'brain.agent.session.get',
  BRAIN_AGENT_SESSION_LIST: 'brain.agent.session.list',
  // brain.hippocampus.memory — command/query
  BRAIN_HIPPOCAMPUS_MEMORY_WRITE: 'brain.hippocampus.memory.write',
  BRAIN_HIPPOCAMPUS_MEMORY_SEARCH: 'brain.hippocampus.memory.search',
  BRAIN_HIPPOCAMPUS_MEMORY_DOCUMENT_GET: 'brain.hippocampus.memory.document.get',
  BRAIN_HIPPOCAMPUS_MEMORY_CHUNK_GET: 'brain.hippocampus.memory.chunk.get',
  BRAIN_HIPPOCAMPUS_MEMORY_REINDEX: 'brain.hippocampus.memory.reindex',
} as const

export const VOICE_QUESTION_STATE = {
  LISTENING: 'LISTENING',
  REWRITING: 'REWRITING',
  WAITING_CONFIRM: 'WAITING_CONFIRM',
  ANSWERING: 'ANSWERING',
  DONE: 'DONE',
  ERROR: 'ERROR',
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
  MOTOR_ANIMATION: {
    actorId: 'motor-animation',
    runtime: 'nest' as const,
    system: 'motor' as const,
    module: 'animation',
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
  BRAIN_AGENT: {
    actorId: 'brain-main',
    runtime: 'nest' as const,
    system: 'brain' as const,
    module: 'agent',
  },
  BRAIN_HIPPOCAMPUS: {
    actorId: 'brain-main',
    runtime: 'nest' as const,
    system: 'brain' as const,
    module: 'hippocampus',
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
  MOTOR_ANIMATION_INPUT_TEXT_TO_FOCUSED_APP: {
    id: 'motor.animation.focused_app.input_text',
    actor: ACTOR.MOTOR_ANIMATION,
    topic: TOPIC.MOTOR_ANIMATION_INPUT_TEXT_TO_FOCUSED_APP,
    kinds: ['command'] as const,
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
  BRAIN_LANGUAGE_OAUTH_PROVIDERS: {
    id: 'brain.language.oauth.providers',
    actor: ACTOR.BRAIN_CORTEX,
    topic: TOPIC.BRAIN_LANGUAGE_OAUTH_PROVIDERS,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_LANGUAGE_OAUTH_LOGIN: {
    id: 'brain.language.oauth.login',
    actor: ACTOR.BRAIN_CORTEX,
    topic: TOPIC.BRAIN_LANGUAGE_OAUTH_LOGIN,
    kinds: ['command'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_AGENT_RUN: {
    id: 'brain.agent.run',
    actor: ACTOR.BRAIN_AGENT,
    topic: TOPIC.BRAIN_AGENT_RUN,
    kinds: ['command'] as const,
    mode: 'stream' as const,
    enabled: true,
    online: true,
  },
  BRAIN_AGENT_CODING_RUN: {
    id: 'brain.agent.coding.run',
    actor: ACTOR.BRAIN_AGENT,
    topic: TOPIC.BRAIN_AGENT_CODING_RUN,
    kinds: ['command'] as const,
    mode: 'stream' as const,
    enabled: true,
    online: true,
  },
  BRAIN_AGENT_SESSION_GET: {
    id: 'brain.agent.session.get',
    actor: ACTOR.BRAIN_AGENT,
    topic: TOPIC.BRAIN_AGENT_SESSION_GET,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_AGENT_SESSION_LIST: {
    id: 'brain.agent.session.list',
    actor: ACTOR.BRAIN_AGENT,
    topic: TOPIC.BRAIN_AGENT_SESSION_LIST,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_HIPPOCAMPUS_MEMORY_WRITE: {
    id: 'brain.hippocampus.memory.write',
    actor: ACTOR.BRAIN_HIPPOCAMPUS,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_WRITE,
    kinds: ['command'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_HIPPOCAMPUS_MEMORY_SEARCH: {
    id: 'brain.hippocampus.memory.search',
    actor: ACTOR.BRAIN_HIPPOCAMPUS,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_SEARCH,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_HIPPOCAMPUS_MEMORY_DOCUMENT_GET: {
    id: 'brain.hippocampus.memory.document.get',
    actor: ACTOR.BRAIN_HIPPOCAMPUS,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_DOCUMENT_GET,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_HIPPOCAMPUS_MEMORY_CHUNK_GET: {
    id: 'brain.hippocampus.memory.chunk.get',
    actor: ACTOR.BRAIN_HIPPOCAMPUS,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_CHUNK_GET,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
  BRAIN_HIPPOCAMPUS_MEMORY_REINDEX: {
    id: 'brain.hippocampus.memory.reindex',
    actor: ACTOR.BRAIN_HIPPOCAMPUS,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_REINDEX,
    kinds: ['command'] as const,
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
