import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error Node strip-types needs .ts extensions.
import { buildAgentRequest, unwrapAgentResponse, applyAgentEvent, readAgentMessage, readRunObservation } from './agent-panel.ts'

test('run observations distinguish cancellation confirmation, unknown and stale executions', () => {
  assert.deepEqual(readRunObservation({ run: { runId: 'r', sessionId: 's', status: 'cancelling' } }, 's', 'r'), { busy: true, status: 'cancelling', runId: 'r', error: '' })
  assert.equal(readRunObservation({ run: { runId: 'r', sessionId: 's', status: 'cancelled' } }, 's', 'r')?.busy, false)
  assert.equal(readRunObservation({ run: null, status: 'unknown' }, 's', 'r')?.status, 'unknown')
  assert.equal(readRunObservation({ run: { runId: 'old', sessionId: 's', status: 'succeeded' } }, 's', 'r'), null)
  assert.equal(readRunObservation({ run: { runId: 'r', sessionId: 'other', status: 'succeeded' } }, 's', 'r'), null)
  assert.throws(() => readRunObservation({ run: { runId: 'r', sessionId: 's', status: 'nonsense' } }, 's', 'r'))
})

test('forwards explicit per-session narration preference and preserves an absent preference', () => {
  assert.equal(buildAgentRequest({ sessionId: 's', userText: 'hi', speechSummaryEnabled: true }).speechSummaryEnabled, true)
  assert.equal(buildAgentRequest({ sessionId: 's', userText: 'hi', speechSummaryEnabled: false }).speechSummaryEnabled, false)
  assert.equal(buildAgentRequest({ sessionId: 's', userText: 'hi' }).speechSummaryEnabled, undefined)
})

test('builds an explicit safe Agent request and rejects missing session or text', () => {
  assert.deepEqual(buildAgentRequest({ sessionId: 's', userText: ' hi ' }), {
    sessionId: 's', userText: 'hi', toolPreset: 'none'
  })
  assert.throws(() => buildAgentRequest({ sessionId: '', userText: 'hi' }), /会话/)
  assert.throws(() => buildAgentRequest({ sessionId: 's', userText: ' ' }), /任务/)
  assert.throws(() => buildAgentRequest({ sessionId: '../bad', userText: 'hi' }), /会话/)
  assert.throws(() => buildAgentRequest({ sessionId: 's', userText: 'hi', toolPreset: 'oops' }), /工具/)
  assert.equal(buildAgentRequest({ sessionId: 's', userText: 'hi', toolPreset: 'coding_only', profileName: ' local ' }).profileName, 'local')
})

test('unwraps actual Neural internal results, detects unrouted and nested errors', () => {
  assert.deepEqual(unwrapAgentResponse({ success: true, data: { answer: 'ok' } }), { answer: 'ok' })
  assert.throws(() => unwrapAgentResponse({ success: true, sentTo: 0 }), /未返回/)
  assert.throws(() => unwrapAgentResponse({ success: false, msg: '模型失败' }), /模型失败/)
  assert.throws(() => unwrapAgentResponse({ success: true, data: { lastError: '额度不足' } }), /额度不足/)
  assert.deepEqual(unwrapAgentResponse({ success: true, data: { lastError: '额度不足', messages: [] } }, true), { lastError: '额度不足', messages: [] })
})

test('reduces full message snapshots without duplicating deltas and isolates session/run', () => {
  const state: any = { sessionId: 's', requestId: '', messages: [], tools: [], status: 'running', error: '' }
  const apply = (event: any, sessionId = 's', requestId = 'r') =>
    applyAgentEvent(state, { sessionId, requestId, event })
  apply({ type: 'message_update', message: { role: 'assistant', content: [{ type: 'text', text: 'wrong' }] } }, 'other')
  assert.equal(state.messages.length, 0)
  apply({ type: 'message_start', message: { role: 'assistant', content: [] } })
  apply({ type: 'message_update', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }, { type: 'thinking', thinking: 'check' }] } })
  apply({ type: 'message_update', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }, { type: 'thinking', thinking: 'check' }] } })
  apply({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } })
  assert.equal(state.messages.length, 1)
  assert.equal(state.messages[0].text, 'hello')
  apply({ type: 'message_start', message: { role: 'assistant', content: [] } }, 's', 'old')
  assert.equal(state.messages.length, 1)
  apply({ type: 'tool_execution_start', toolCallId: 't', toolName: 'test', args: { a: 1 } })
  apply({ type: 'tool_execution_end', toolCallId: 't', toolName: 'test', result: { content: [{ type: 'text', text: 'done' }] }, isError: false })
  assert.equal(state.tools[0].status, 'done')
  assert.match(state.tools[0].result, /done/)
  apply({ type: 'agent_end' })
  assert.equal(state.status, 'done')
})

test('reads user strings, thinking, tool calls, images and backend errors without HTML execution', () => {
  assert.equal(readAgentMessage({ role: 'user', content: '你好' }).text, '你好')
  const msg = readAgentMessage({ role: 'assistant', content: [{ type: 'text', text: '<script>x</script>' }, { type: 'thinking', thinking: '分析' }, { type: 'toolCall', name: 'read', arguments: {} }] })
  assert.ok(msg.text.startsWith('<script>x</script>'))
  assert.match(msg.text, /调用 read/)
  assert.equal(msg.thinking, '分析')
  assert.match(msg.text, /script/)
  const state: any = { sessionId: 's', requestId: '', messages: [], tools: [], status: 'running', error: '' }
  applyAgentEvent(state, { sessionId: 's', requestId: 'r', event: { type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'boom' } } })
  assert.equal(state.error, 'boom')
  assert.equal(state.status, 'error')
})
