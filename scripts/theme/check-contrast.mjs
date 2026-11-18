/**
 * 主题对比度校验
 *
 * 对 dark / light 两套主题的关键前景-背景组合做 WCAG 对比度检查，
 * 避免改色后出现文字看不清的情况。
 *
 * 用法：node scripts/theme/check-contrast.mjs
 */
import { loadTokens } from './tokens.mjs'

function luminance(hex) {
  const value = hex.replace('#', '')
  const rgb = value.length === 3
    ? value.split('').map(char => Number.parseInt(char + char, 16))
    : [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16))
  const [r, g, b] = rgb.map(channel => {
    const srgb = channel / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

const PAIRS = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-raised', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-subtle', 'surface', 4.5],
  ['on-accent', 'accent-strong', 4.5],
  ['success', 'surface', 4.5],
  ['warning', 'surface', 4.5],
  ['danger', 'surface', 4.5],
  ['info', 'surface', 4.5],
  ['success', 'success-soft', 4.5],
  ['warning', 'warning-soft', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['accent', 'accent-soft', 4.5],
  ['info', 'info-soft', 4.5],
  ['border', 'input', 3],
  ['accent', 'bg', 3],
]

const tokens = loadTokens()
let failed = 0

for (const mode of Object.keys(tokens.themes)) {
  const palette = tokens.themes[mode].tokens
  for (const [foreground, background, minimum] of PAIRS) {
    const ratio = contrast(palette[foreground], palette[background])
    const ok = ratio >= minimum
    if (!ok) failed += 1
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${mode.padEnd(5)} ${foreground} on ${background}: ${ratio.toFixed(2)} (>= ${minimum})`,
    )
  }
}

if (failed > 0) {
  console.error(`\n[theme] ${failed} 组对比度不达标`)
  process.exitCode = 1
} else {
  console.log('\n[theme] 全部对比度达标')
}
