import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node strip-types needs a .ts extension.
import { SpeechPlaybackGate, startSpeechPlayback } from './speech-playback.ts'

test('a lease invalidated during asynchronous preparation never starts audio', async () => {
  const gate = new SpeechPlaybackGate()
  const ticket = { scope: 'chat-panel', token: 'session:one' }
  gate.set(ticket)
  let played = 0
  let release!: () => void
  const preparation = new Promise<void>(resolve => { release = resolve })
  const pending = (async () => {
    await preparation
    return startSpeechPlayback(ticket, async t => gate.current(t), async () => { played++ })
  })()
  gate.set({ scope: 'chat-panel', token: '' })
  release()
  assert.equal(await pending, false)
  assert.equal(played, 0)
  gate.set({ scope: 'chat-panel', token: 'session:two' })
  assert.equal(gate.current(ticket), false)
  assert.equal(await startSpeechPlayback({ scope: 'chat-panel', token: 'session:two' }, async t => gate.current(t), async () => { played++ }), true)
  assert.equal(played, 1)
  await startSpeechPlayback(undefined, async () => false, async () => { played++ })
  assert.equal(played, 2, 'ordinary/manual perform remains unaffected')
})
