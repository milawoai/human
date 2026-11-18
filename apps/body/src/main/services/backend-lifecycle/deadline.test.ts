import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node strip-types needs a .ts extension.
import { waitUntil } from './deadline.ts'

test('registration deadline advances through injected time without real waiting', async () => {
  let now = 0, attempts = 0
  const signal = new AbortController().signal
  const clock = { now: () => now, sleep: async (ms: number) => { now += ms } }
  await assert.rejects(waitUntil(async () => { attempts++; return false }, clock, signal, 20, 7), /readiness timeout/)
  assert.equal(now, 20)
  assert.equal(attempts, 3)
})

test('registration succeeds after delay and cancellation prevents further probes', async () => {
  let now = 0, calls = 0
  const controller = new AbortController()
  const clock = { now: () => now, sleep: async (ms: number) => { now += ms } }
  await waitUntil(async () => ++calls === 2, clock, controller.signal, 20, 7)
  assert.equal(now, 7)
  controller.abort(Error('shutdown'))
  await assert.rejects(waitUntil(async () => { calls++; return true }, clock, controller.signal, 20, 7), /shutdown/)
  assert.equal(calls, 2)
})
