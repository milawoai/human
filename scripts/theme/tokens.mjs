import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
export const DESIGNS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../designs')
export function loadTokens() { return JSON.parse(readFileSync(join(DESIGNS_DIR, 'theme.tokens.json'), 'utf8')) }

/**
 * 生成 pen variables：颜色走 dark/light 双模 theme axis，
 * 字体/字号/圆角/间距为与主题无关的静态值。
 */
export function buildVariables(tokens = loadTokens()) {
  const common = tokens.common
  const dark = tokens.themes.dark.tokens
  const variables = {}

  for (const key of Object.keys(dark)) {
    if (key === 'shadow') continue
    variables[key] = {
      type: 'color',
      value: Object.entries(tokens.themes).map(([id, theme]) => {
        if (typeof theme.tokens[key] !== 'string') throw Error(`Missing ${id} theme token: ${key}`)
        return { value: theme.tokens[key], theme: { mode: id } }
      }),
    }
  }

  variables['font-body'] = { type: 'string', value: common['pen-font-body'] }
  variables['font-mono'] = { type: 'string', value: common['pen-font-mono'] }

  for (const [key, value] of Object.entries(common['font-size-px'])) {
    variables[`font-size-${key}`] = { type: 'number', value }
  }

  variables['line-height'] = { type: 'number', value: Number(common['line-height']) }

  for (const [key, token] of [['sm', 'radius-sm'], ['md', 'radius-md'], ['lg', 'radius-lg']]) {
    variables[`radius-${key}`] = { type: 'number', value: Number.parseFloat(common[token]) }
  }

  for (let index = 1; index <= 8; index += 1) {
    variables[`space-${index}`] = {
      type: 'number',
      value: Math.round(Number.parseFloat(common[`spacing-${index}`]) * 16),
    }
  }

  return variables
}

export function themeAxes(tokens = loadTokens()) { return { mode: Object.keys(tokens.themes) } }
export const THEME_AXIS = themeAxes()
