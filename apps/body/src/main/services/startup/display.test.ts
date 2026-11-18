import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
// @ts-expect-error Node strip-types import.
import { waitForStartupDisplay } from './display.ts'
class Window extends EventEmitter {
  webContents = new EventEmitter()
  isVisible() { return false }
  isDestroyed() { return false }
}
test('fast work cannot close splash before actual show plus minimum duration', async () => {
  const window = new Window()
  let complete = false
  const gate = waitForStartupDisplay(window, new AbortController().signal, 60, 1000).then(() => { complete = true })
  await sleep(80)
  assert.equal(complete, false)
  const shown = performance.now()
  window.emit('show')
  await gate
  assert(performance.now() - shown >= 59)
  assert.equal(window.listenerCount('show'), 0)
})
test('quit cancels even before first show, without leaving event listeners', async () => {
  const window = new Window(), controller = new AbortController()
  const gate = waitForStartupDisplay(window, controller.signal)
  controller.abort(Error('quit'))
  await assert.rejects(gate, /quit/)
  assert.equal(window.listenerCount('show'), 0)
  assert.equal(window.webContents.listenerCount('did-fail-load'), 0)
})
test('load failure and missing first show reject instead of hanging', async () => {
  const window = new Window()
  const gate = waitForStartupDisplay(window, new AbortController().signal)
  window.webContents.emit('did-fail-load', {}, -2, 'failed', '', true)
  await assert.rejects(gate, /failed/)
  await assert.rejects(waitForStartupDisplay(new Window(), new AbortController().signal, 10, 20), /显示超时/)
})
