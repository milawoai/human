/**
 * 生成 designs/theme.pen —— 主题定义 + 主题规范展示页
 *
 * 页面本身只引用 token（$bg / $text / $font-size-* ...），不写死任何颜色，
 * 因此切换 mode 轴即可一键换肤，页面结构无需改动。
 */
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DESIGNS_DIR, themeAxes, buildVariables, loadTokens } from './tokens.mjs'

const OUT_FILE = join(DESIGNS_DIR, 'theme.pen')

import { text, frame, box, BODY, MONO } from './nodes.mjs'
import { buildFoundation } from './foundation.mjs'
import { buildComponents } from './components.mjs'
function buildScreen(tokens) {
  const screen = frame('主题规范', {
    theme: { mode: tokens.defaultTheme },
    x: 0,
    y: 0,
    width: 1280,
    layout: 'vertical',
    padding: 48,
    gap: 36,
    fill: '$bg',
    clip: true,
  })

  buildFoundation(screen)
  buildComponents(screen)
  // ---------- Footer ----------
  const footer = frame('Footer', { layout: 'vertical', gap: 6, width: 'fill_container' })
  footer.children.push(
    text('Title', '应用切换与设计同步', { fontFamily: BODY, fontSize: '$font-size-lg', fontWeight: 'bold', fill: '$text' }),
    text('Desc', '使用应用：设置页“外观主题”选择内置预设，立即同步所有窗口并保存。维护设计：运行 yarn theme:use paper-white 从主题文件选择并重建；改公共变量后用 yarn theme:sync 同步页面设计稿。编辑器 mode 轴用于设计预览。', {
      textGrowth: 'fixed-width',
      width: 'fill_container',
      fontFamily: BODY,
      fontSize: '$font-size-sm',
      fill: '$text-muted',
      lineHeight: '$line-height',
    }),
  )
  screen.children.push(footer)

  return screen
}

export function buildThemeDocument(tokens = loadTokens()) {
  if (!tokens.themes[tokens.defaultTheme]) throw Error('Unknown default theme')
  return { version: '2.17', themes: themeAxes(tokens), variables: buildVariables(tokens), children: [buildScreen(tokens)] }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const document = buildThemeDocument()
  writeFileSync(OUT_FILE, `${JSON.stringify(document, null, 2)}\n`)
  console.log(`[theme] wrote ${OUT_FILE} (${Object.keys(document.variables).length} variables)`)
}
