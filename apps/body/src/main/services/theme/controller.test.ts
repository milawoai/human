import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node strip-types import.
import { ThemeController } from './controller.ts'
// @ts-expect-error Node strip-types import.
import { defaultTheme } from '../../../shared/theme.ts'

test('theme choice persists, publishes once and is inherited by new windows', () => {
  let saved: unknown
  const published: any[] = []
  const controller = new ThemeController(undefined, next => { saved = next }, next => published.push(next))
  assert.equal(controller.snapshot().id, defaultTheme.id)
  const changed = controller.set({ id: 'light', fontScale: 1.125 })
  assert.equal(changed.revision, 1)
  assert.deepEqual(saved, { id: 'light', fontScale: 1.125 })
  assert.equal(published.length, 1)
  assert.equal(new ThemeController(saved, () => {}, () => {}).snapshot().id, 'light')
  controller.set({ id: 'light', fontScale: 1.125 })
  assert.equal(published.length, 1)
})
test('invalid updates and failed persistence never broadcast or change current preference', () => {
  const controller = new ThemeController({ id: 'unknown' }, () => { throw Error('disk full') }, () => { assert.fail('broadcast') })
  assert.equal(controller.snapshot().id, defaultTheme.id)
  assert.throws(() => controller.set({ id: 'unknown', fontScale: 1 }))
  assert.throws(() => controller.set({ id: 'light', fontScale: 8 }))
  assert.throws(() => controller.set({ id: 'light', fontScale: 1.125 }), /disk full/)
  assert.equal(controller.snapshot().id, defaultTheme.id)
})
