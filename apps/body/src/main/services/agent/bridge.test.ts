import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error Node strip-types requires .ts.
import { executeAgentRun } from './bridge.ts'

test('waits for event subscription before execution, filters other sessions and cleans up', async () => {
  const order: string[] = []
  const seen: any[] = []
  const result = await executeAgentRun({ sessionId: 's', userText: ' hi ' }, {
    observe: async (receive: any) => {
      order.push('subscribed')
      receive({ topic: 'brain.agent.run.event', payload: { sessionId: 'other', requestId: 'r', event: {} } })
      receive({ topic: 'brain.agent.run.event', payload: { sessionId: 's', requestId: 'r', event: { type: 'agent_start' } } })
      return () => { order.push('cleanup') }
    },
    trigger: async (request: any) => {
      order.push('run')
      assert.equal(request.topic, 'brain.agent.run')
      assert.equal(request.payload.toolPreset, 'none')
      return { success: true, data: { sessionId: 's' } }
    },
    emit: (event: any) => { seen.push(event) }
  })
  assert.deepEqual(order, ['subscribed', 'run', 'cleanup'])
  assert.equal(seen.length, 1)
  assert.equal(result.sessionId, 's')
})

test('cleans subscriptions on HTTP failure and never executes if observation fails', async () => {
  let cleaned = 0
  let ran = 0
  const deps = {
    observe: async () => () => { cleaned++ },
    trigger: async () => { ran++; throw new Error('HTTP failed') },
    emit: () => {}
  }
  await assert.rejects(executeAgentRun({ sessionId: 's', userText: 'hi' }, deps), /HTTP failed/)
  assert.equal(cleaned, 1)
  await assert.rejects(executeAgentRun({ sessionId: 's', userText: 'hi' }, {
    ...deps, observe: async () => { throw new Error('subscribe failed') }
  }), /subscribe failed/)
  assert.equal(ran, 1)
})
