/**
 * 生成 designs/theme.pen —— 主题定义 + 主题规范展示页
 *
 * 页面本身只引用 token（$bg / $text / $font-size-* ...），不写死任何颜色，
 * 因此切换 mode 轴即可一键换肤，页面结构无需改动。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESIGNS_DIR, THEME_AXIS, buildVariables, loadTokens } from './tokens.mjs'

const OUT_FILE = join(DESIGNS_DIR, 'theme.pen')

import { text, frame, box, BODY, MONO } from './nodes.mjs'
import { buildFoundation } from './foundation.mjs'
import { buildComponents } from './components.mjs'
function buildScreen() {
  const screen = frame('主题规范', {
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
    text('Title', '一键更换主题', { fontFamily: BODY, fontSize: '$font-size-lg', fontWeight: 'bold', fill: '$text' }),
    text('Desc', '改 designs/theme.tokens.json 的色值后执行 node scripts/theme/sync-theme.mjs，theme.pen 与所有页面设计稿同步更新；在 pen.dev 编辑器里切换 mode 轴即可在 dark / light 间即时切换。', {
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

const tokens = loadTokens()
const document = {
  version: '2.17',
  themes: THEME_AXIS,
  variables: buildVariables(tokens),
  children: [buildScreen()],
}

writeFileSync(OUT_FILE, `${JSON.stringify(document, null, 2)}\n`)
console.log(`[theme] wrote ${OUT_FILE} (${Object.keys(document.variables).length} variables)`)
