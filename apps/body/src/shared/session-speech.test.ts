import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node strip-types tests require explicit .ts extensions.
import { readSpeechPreference, saveSpeechPreference, playSessionSpeech } from './session-speech.ts'

test('preferences default off, persist independently, and explicit local off overrides backend on', () => {
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  assert.equal(readSpeechPreference(storage, 'a'), false)
  saveSpeechPreference(storage, 'a', true)
  assert.equal(readSpeechPreference(storage, 'a'), true)
  assert.equal(readSpeechPreference(storage, 'b'), false)
  saveSpeechPreference(storage, 'a', false)
  assert.equal(readSpeechPreference(storage, 'a', true), false)
  assert.equal(readSpeechPreference(storage, 'b', true), true)
})

test('only current enabled request plays a valid independent speech field; failures are nonfatal', async () => {
  let calls = 0
  const perform = async () => { calls++; return { success: true } }
  const speech = { status: 'ready', summary: '已完成。', audioUrl: 'http://localhost/a.wav' }
  await playSessionSpeech(speech, () => false, perform)
  await playSessionSpeech({ ...speech, summary: '' }, () => true, perform)
  await playSessionSpeech({ ...speech, audioUrl: 'file:///tmp/a.wav' }, () => true, perform)
  await playSessionSpeech(undefined, () => true, perform)
  assert.equal(calls, 0)
  await playSessionSpeech(speech, () => true, perform)
  assert.equal(calls, 1)
  assert.match(await playSessionSpeech(speech, () => true, async () => { throw new Error('offline') }), /offline/)
  assert.match(await playSessionSpeech(speech, () => true, async () => ({ success: true, data: { audioPlayed: false, audioError: 'decode failed' } })), /decode failed/)
  assert.match(await playSessionSpeech({ status: 'failed', error: 'engine failed' }, () => true, perform), /engine failed/)
})
