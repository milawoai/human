import definitions from '../../../../designs/theme.tokens.json' with { type: 'json' }
export const themeDefinitions = definitions
export type ThemeId = keyof typeof definitions.themes
export interface ThemePreference { id: ThemeId; fontScale: number }
export interface ThemeSnapshot extends ThemePreference { revision: number }
export const defaultTheme: ThemePreference = { id: definitions.defaultTheme as ThemeId, fontScale: 1 }
export function validateTheme(value: unknown): ThemePreference {
  const preference = value as ThemePreference
  if (!preference || !Object.hasOwn(definitions.themes, preference.id) || ![1, 1.125, 1.25].includes(preference.fontScale)) {
    throw Error('无效的主题或字号设置')
  }
  return { id: preference.id, fontScale: preference.fontScale }
}
export function themeVariables(preference: ThemePreference): Record<string, string> {
  const valid = validateTheme(preference)
  const tokens = { ...definitions.common, ...definitions.themes[valid.id].tokens }
  const base = definitions.common['font-size-px'].base
  const typography = Object.fromEntries(Object.entries(definitions.common['font-size-px']).map(([key, value]) => [`--human-text-${key}`, `${value / base}rem`]))
  return { ...Object.fromEntries(Object.entries(tokens).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([key, value]) => [`--human-${key}`, value])),
    ...typography, '--human-root-size': `${base * valid.fontScale}px` }
}
export function themeBootstrapCss(preference: ThemePreference): string {
  const variables = Object.entries(themeVariables(preference)).map(([key, value]) => `${key}:${value}`).join(';')
  return `:root{${variables};color-scheme:${preference.id}}html{font-size:var(--human-root-size)!important}`
}
