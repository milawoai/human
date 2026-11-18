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
test('a named preset uses its declared color scheme and palette, independently of its id', async () => {
  // @ts-expect-error Node strip-types import.
  const { themeDefinitions, validateTheme, themeScheme } = await import('./theme.ts')
  const registry = themeDefinitions.themes as Record<string, any>
  registry.forest = { ...structuredClone(registry.dark), scheme: 'dark' }
  registry.forest.tokens.accent = '#88ccaa'
  try {
    const preference = validateTheme({ id: 'forest', fontScale: 1 })
    assert.equal(themeScheme(preference.id), 'dark')
    assert.equal(themeVariables(preference)['--human-accent'], '#88ccaa')
    assert(themeBootstrapCss(preference).includes('color-scheme:dark'))
  } finally { delete registry.forest }
})
