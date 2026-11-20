import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
// @ts-expect-error Node strip-types needs a .ts extension.
import { createApprovalFrames } from '../job-approval-frames.ts'
import type { DesktopDecision } from '../job-approval-frames'

test('approval UI only receives authenticated current-instance requests and persists after acknowledgement', async () => {
  const token = 'fixture-owner-token'
  const instanceId = 'fixture-backend'
  const writes: string[] = []
  let prompted = 0, persisted = 0
  let answer!: (value: DesktopDecision) => void
  let signal!: AbortSignal
  const frames = createApprovalFrames(token, instanceId, line => writes.push(line), {
    ask: async (_request, nextSignal) => {
      prompted++
      signal = nextSignal
      return new Promise(resolve => { answer = resolve })
    },
    persist: () => { persisted++ },
  })
  const request = { type: 'job-approval', instanceId, approvalId: '12345678-1111-1111-1111-123456789abc',
    jobId: '12345678-2222-2222-2222-123456789abc', seq: 3, operation: 'read', path: '/fixture/资料.txt',
    expiresAt: Date.now() + 5000 }
  const signed = (frame: object, key = token) => {
    const body = JSON.stringify(frame)
    return `[human-job-approval] ${createHmac('sha256', key).update(body).digest('hex')} ${body}`
  }
  frames.consume(signed(request, 'forgery'))
  frames.consume(signed({ ...request, instanceId: 'old' }))
  assert.equal(prompted, 0)
  frames.consume(signed(request))
  assert.equal(prompted, 1)
  answer('directory')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(JSON.parse(writes[0]).decision, 'directory')
  assert.equal(persisted, 0)
  frames.consume(signed({ type: 'job-approval-persist', instanceId, approvalId: request.approvalId }))
  assert.equal(persisted, 1)
  assert.equal(signal.aborted, true)
  frames.consume(signed({ ...request, approvalId: request.jobId }))
  frames.consume(signed({ type: 'job-approval-close', instanceId, approvalId: request.jobId }))
  answer('once')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(writes.length, 1)
})
