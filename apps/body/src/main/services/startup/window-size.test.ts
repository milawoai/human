import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node strip-types import.
import { startupWindowBounds } from './window-size.ts'
test('startup window grows with text scale and centers in the display work area', () => {
  const area = { x: 100, y: 40, width: 1200, height: 800 }
  assert.deepEqual(startupWindowBounds(1, area), { x: 460, y: 280, width: 480, height: 320 })
  assert.deepEqual(startupWindowBounds(1.25, area), { x: 400, y: 240, width: 600, height: 400 })
})
test('startup window remains within a small display and invalid scales fall back safely', () => {
  const area = { x: -500, y: 20, width: 500, height: 280 }
  assert.deepEqual(startupWindowBounds(1.25, area), { ...area })
  assert.equal(startupWindowBounds(NaN, { ...area, width: 1000 }).width, 480)
})
