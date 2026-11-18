import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node strip-types import.
import { themeVariables, themeBootstrapCss } from './theme.ts'
test('design typography is the same scale used by runtime, without serializing design metadata', () => {
  const standard = themeVariables({ id: 'dark', fontScale: 1 })
  const large = themeVariables({ id: 'light', fontScale: 1.25 })
  assert.equal(standard['--human-root-size'], '16px')
  assert.equal(standard['--human-text-base'], '1rem')
  assert.equal(large['--human-root-size'], '20px')
  assert.equal(large['--human-text-sm'], '0.875rem')
  assert(Object.values(large).every(value => typeof value === 'string'))
  assert(!themeBootstrapCss({ id: 'dark', fontScale: 1 }).includes('[object Object]'))
})
