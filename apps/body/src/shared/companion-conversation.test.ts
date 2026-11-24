import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error Node strip-types requires .ts extensions.
import { buildCompanionQuestionPayload, getConfirmedQuestionAction, readConversation, readCurrentConversation, readCompanionTranscript, loadCompanionConversation, createFreshCompanionConversation } from './companion-conversation.ts'

const id = '11111111-1111-4111-8111-111111111111'

test('maps Neural conversation success, error and null current without exposing paths', () => {
  assert.deepEqual(readConversation({ success: true, data: { conversation: {
    conversationId: id, conversationType: 'companion', status: 'pending', createdAt: 1,
    updatedAt: 1, lastOpenedAt: 1, piSessionPath: '/must/not/leak'
  } } }), {
    conversationId: id, conversationType: 'companion', status: 'pending', createdAt: 1,
    updatedAt: 1, lastOpenedAt: 1
  })
  assert.equal(readCurrentConversation({ success: true, data: { conversation: null } }), null)
  assert.throws(() => readConversation({ success: false, msg: '后端离线' }), /后端离线/)
  assert.throws(() => readConversation({ success: true, data: {} }), /会话/)
})

test('validates and maps current-branch transcript messages', () => {
  assert.deepEqual(readCompanionTranscript({ success: true, data: { conversationId: id, messages: [
    { id: 'a', role: 'user', content: '你好', timestamp: 1 },
    { id: 'b', role: 'assistant', content: '你好呀', timestamp: 2 },
    { id: 'x', role: 'tool', content: '隐藏', timestamp: 3 }
  ] } }, id), [
    { id: 'a', role: 'user', content: '你好', timestamp: 1 },
    { id: 'b', role: 'assistant', content: '你好呀', timestamp: 2 }
  ])
  assert.throws(() => readCompanionTranscript({ success: true, data: { conversationId: crypto.randomUUID(), messages: [] } }, id), /不匹配/)
})

test('builds a Pi companion ask payload from an authorized conversation id', () => {
  assert.deepEqual(buildCompanionQuestionPayload({
    conversationId: id, question: ' 你好 ', requestId: 'r', speechSummaryEnabled: true
  }), {
    type: 'confirmed', conversationId: id, sessionId: id, requestId: 'r', confirmedQuestion: '你好',
    speechSummaryEnabled: true, source: 'body.chat-panel'
  })
  assert.throws(() => buildCompanionQuestionPayload({ conversationId: '../bad', question: '你好' }), /会话/)
  assert.throws(() => buildCompanionQuestionPayload({ conversationId: id, question: ' ' }), /问题/)
})

test('restores current conversation or creates one before loading its transcript', async () => {
  const conversation = { conversationId: id, conversationType: 'companion', status: 'pending',
    createdAt: 1, updatedAt: 1, lastOpenedAt: 1 }
  const calls: string[] = []
  const restored = await loadCompanionConversation({
    current: async () => { calls.push('current'); return { success: true, data: { conversation: null } } },
    create: async () => { calls.push('create'); return { success: true, data: { conversation } } },
    transcript: async (conversationId: string) => { calls.push(`transcript:${conversationId}`); return {
      success: true, data: { conversationId, messages: [{ id: 'm', role: 'user', content: '历史', timestamp: 1 }] }
    } }
  })
  assert.deepEqual(calls, ['current', 'create', `transcript:${id}`])
  assert.equal(restored.conversation.conversationId, id)
  assert.equal(restored.messages[0].content, '历史')
})

test('new conversation is transactional and rejects before the caller clears old UI', async () => {
  await assert.rejects(createFreshCompanionConversation(async () => ({ success: false, msg: '创建失败' })), /创建失败/)
  const conversation = await createFreshCompanionConversation(async () => ({ success: true, data: { conversation: {
    conversationId: id, conversationType: 'companion', status: 'pending', createdAt: 1, updatedAt: 1, lastOpenedAt: 1
  } } }))
  assert.equal(conversation.conversationId, id)
})

test('keeps a confirmed voice question as a draft while another answer is running', () => {
  assert.equal(getConfirmedQuestionAction({ hasConversation: true, restoring: false, busy: true }), 'draft')
  assert.equal(getConfirmedQuestionAction({ hasConversation: false, restoring: false, busy: false }), 'queue')
  assert.equal(getConfirmedQuestionAction({ hasConversation: true, restoring: true, busy: false }), 'queue')
  assert.equal(getConfirmedQuestionAction({ hasConversation: true, restoring: false, busy: false }), 'submit')
})
