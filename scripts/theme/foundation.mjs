import { text, frame, box, BODY, MONO } from './nodes.mjs'
export function buildFoundation(screen) {
  // ---------- Header ----------
  const header = frame('Header', { layout: 'vertical', gap: 10, width: 'fill_container' })
  header.children.push(
    text('标题', 'Human 设计主题', {
      fontFamily: BODY,
      fontSize: '$font-size-display',
      fontWeight: 'bold',
      fill: '$text',
      lineHeight: 1.2,
    }),
    text('说明', '所有页面共享这一套 token。切换 mode 轴即可比较内置主题，应用设置页使用同一套预设。', {
      textGrowth: 'fixed-width',
      width: 'fill_container',
      fontFamily: BODY,
      fontSize: '$font-size-base',
      fill: '$text-muted',
      lineHeight: '$line-height',
    }),
  )

  const tokens = frame('Tokens', { gap: 8, alignItems: 'center' })
  for (const [label, color] of [['背景', '$bg'], ['表面', '$surface'], ['强调', '$accent']]) {
    const chip = frame(`Token ${label}`, {
      gap: 6,
      alignItems: 'center',
      padding: [6, 10],
      cornerRadius: '$radius-sm',
      fill: '$surface-raised',
    })
    chip.children.push(
      box('ellipse', 'Dot', { width: 8, height: 8, fill: color }),
      text('Label', label, { fontFamily: BODY, fontSize: '$font-size-xs', fill: '$text-muted' }),
    )
    tokens.children.push(chip)
  }
  header.children.push(tokens)
  screen.children.push(header)

  // ---------- 颜色 ----------
  const colorSection = frame('颜色', { layout: 'vertical', gap: 16, width: 'fill_container' })
  const colorHead = frame('颜色 Head', { layout: 'vertical', gap: 4, width: 'fill_container' })
  colorHead.children.push(
    text('Title', '颜色 Color', { fontFamily: BODY, fontSize: '$font-size-xl', fontWeight: 'bold', fill: '$text' }),
    text('Desc', '语义化命名：所有页面只引用 token 名，禁止写死颜色。', {
      fontFamily: BODY,
      fontSize: '$font-size-sm',
      fill: '$text-subtle',
    }),
  )
  colorSection.children.push(colorHead)

  const swatchRows = [
    [
      ['bg', '$bg', '页面最底层'],
      ['surface', '$surface', '卡片 / 面板'],
      ['surface-raised', '$surface-raised', '浮层 / 弹窗'],
      ['surface-hover', '$surface-hover', '悬停态'],
      ['input', '$input', '输入框底色'],
      ['scrim', '$scrim', '遮罩'],
    ],
    [
      ['text', '$text', '主要文本'],
      ['text-muted', '$text-muted', '次要文本'],
      ['text-subtle', '$text-subtle', '弱化 / 占位'],
      ['border', '$border', '描边分隔'],
      ['accent', '$accent', '强调色'],
      ['on-accent', '$on-accent', '实心强调背景上的文字'],
    ],
    [
      ['accent-strong', '$accent-strong', '实心强调背景'],
      ['accent-soft', '$accent-soft', '强调弱背景'],
      ['success', '$success', '成功'],
      ['success-soft', '$success-soft', '成功弱背景'],
      ['warning', '$warning', '警告'],
      ['warning-soft', '$warning-soft', '警告弱背景'],
    ],
    [
      ['danger', '$danger', '危险'],
      ['danger-soft', '$danger-soft', '危险弱背景'],
      ['info', '$info', '信息'],
      ['info-soft', '$info-soft', '信息弱背景'],
    ],
  ]

  for (const items of swatchRows) {
    const row = frame('Row', { gap: 12, width: 'fill_container' })
    for (const [token, color, usage] of items) {
      const card = frame(`Swatch ${token}`, { layout: 'vertical', gap: 8, width: 'fill_container' })
      card.children.push(
        box('rectangle', 'Color', {
          width: 'fill_container',
          height: 56,
          cornerRadius: '$radius-md',
          fill: color,
          stroke: '$border',
          strokeWidth: 1,
          strokeAlignment: 'inner',
        }),
        text('Token', token, { fontFamily: BODY, fontSize: '$font-size-xs', fontWeight: 'bold', fill: '$text' }),
        text('Usage', usage, {
          textGrowth: 'fixed-width',
          width: 'fill_container',
          fontFamily: BODY,
          fontSize: '$font-size-xs',
          fill: '$text-subtle',
        }),
      )
      row.children.push(card)
    }
    colorSection.children.push(row)
  }
  screen.children.push(colorSection)

  // ---------- 排版 ----------
  const typeSection = frame('排版', { layout: 'vertical', gap: 16, width: 'fill_container' })
  const typeHead = frame('排版 Head', { layout: 'vertical', gap: 4, width: 'fill_container' })
  typeHead.children.push(
    text('Title', '排版 Typography', { fontFamily: BODY, fontSize: '$font-size-xl', fontWeight: 'bold', fill: '$text' }),
    text('Desc', '字体族 $font-body / $font-mono，基准行高 $line-height。', {
      fontFamily: BODY,
      fontSize: '$font-size-sm',
      fill: '$text-subtle',
    }),
  )
  typeSection.children.push(typeHead)

  const typeScale = [
    ['$font-size-display', '页面主标题'],
    ['$font-size-title', '区块标题'],
    ['$font-size-xl', '小节标题'],
    ['$font-size-lg', '强调正文'],
    ['$font-size-md', '正文'],
    ['$font-size-base', '标准正文'],
    ['$font-size-sm', '辅助文本'],
    ['$font-size-xs', '标签 / 说明'],
  ]
  for (const [size, usage] of typeScale) {
    const row = frame(`Type ${size}`, { gap: 24, alignItems: 'center', width: 'fill_container' })
    row.children.push(
      text('Meta', `${size.replace('$font-size-', '')} · ${usage}`, {
        fontFamily: MONO,
        fontSize: '$font-size-sm',
        fill: '$text-subtle',
        width: 220,
        textGrowth: 'fixed-width',
      }),
      text('Sample', '模型设置 Model Settings', { fontFamily: BODY, fontSize: size, fill: '$text' }),
    )
    typeSection.children.push(row)
  }
  screen.children.push(typeSection)

}
