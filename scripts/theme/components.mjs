import { text, frame, box, BODY, MONO } from './nodes.mjs'
export function buildComponents(screen) {
  // ---------- 组件 ----------
  const compSection = frame('组件', { layout: 'vertical', gap: 16, width: 'fill_container' })
  const compHead = frame('组件 Head', { layout: 'vertical', gap: 4, width: 'fill_container' })
  compHead.children.push(
    text('Title', '组件 Components', { fontFamily: BODY, fontSize: '$font-size-xl', fontWeight: 'bold', fill: '$text' }),
    text('Desc', '组件只允许引用 token；换主题时组件外观随 token 自动切换。', {
      fontFamily: BODY,
      fontSize: '$font-size-sm',
      fill: '$text-subtle',
    }),
  )
  compSection.children.push(compHead)

  const grid = frame('Grid', { gap: 24, width: 'fill_container', alignItems: 'start' })

  const buttonCol = frame('Col Buttons', { layout: 'vertical', gap: 12, width: 'fill_container' })
  buttonCol.children.push(text('Cap', '按钮 Button', { fontFamily: BODY, fontSize: '$font-size-xs', fontWeight: 'bold', fill: '$text-subtle' }))
  for (const [label, bg, fg] of [
    ['主要操作', '$accent-strong', '$on-accent'],
    ['次要操作', '$surface-raised', '$text'],
    ['危险操作', '$danger-soft', '$danger'],
    ['幽灵按钮', '$surface', '$text-muted'],
  ]) {
    const button = frame(`Button ${label}`, {
      padding: [10, 16],
      cornerRadius: '$radius-md',
      fill: bg,
      alignItems: 'center',
      ...(label === '次要操作' ? { stroke: '$border', strokeWidth: 1, strokeAlignment: 'inner' } : {}),
    })
    button.children.push(text('Label', label, { fontFamily: BODY, fontSize: '$font-size-sm', fontWeight: 'bold', fill: fg }))
    buttonCol.children.push(button)
  }
  grid.children.push(buttonCol)

  const inputCol = frame('Col Inputs', { layout: 'vertical', gap: 12, width: 'fill_container' })
  inputCol.children.push(text('Cap', '输入 Input', { fontFamily: BODY, fontSize: '$font-size-xs', fontWeight: 'bold', fill: '$text-subtle' }))
  const inputs = [
    ['Input Default', '$border', 1, 'https://open.bigmodel.cn/api/paas/v4', '$text', MONO],
    ['Input Placeholder', '$border', 1, '输入 Base URL…', '$text-subtle', BODY],
    ['Input Focus', '$accent', 2, '聚焦态：描边 $accent', '$text', BODY],
  ]
  for (const [name, stroke, strokeWidth, value, fill, family] of inputs) {
    const field = frame(name, {
      width: 'fill_container',
      padding: [10, 12],
      cornerRadius: '$radius-md',
      fill: '$input',
      stroke,
      strokeWidth,
      strokeAlignment: 'inner',
    })
    field.children.push(text('Value', value, { fontFamily: family, fontSize: '$font-size-sm', fill }))
    inputCol.children.push(field)
  }
  grid.children.push(inputCol)

  const badgeCol = frame('Col Badges', { layout: 'vertical', gap: 12, width: 'fill_container' })
  badgeCol.children.push(text('Cap', '徽章 Badge / 状态', { fontFamily: BODY, fontSize: '$font-size-xs', fontWeight: 'bold', fill: '$text-subtle' }))
  for (const [label, bg, fg] of [
    ['已连接', '$success-soft', '$success'],
    ['待更新', '$warning-soft', '$warning'],
    ['连接失败', '$danger-soft', '$danger'],
    ['默认档案', '$accent-soft', '$accent'],
    ['说明', '$info-soft', '$info'],
  ]) {
    const row = frame('Badge Row', { gap: 8, alignItems: 'center' })
    const badge = frame(`Badge ${label}`, { padding: [5, 10], cornerRadius: '$radius-sm', fill: bg, alignItems: 'center' })
    badge.children.push(text('Label', label, { fontFamily: BODY, fontSize: '$font-size-xs', fontWeight: 'bold', fill: fg }))
    row.children.push(badge)
    badgeCol.children.push(row)
  }
  grid.children.push(badgeCol)
  compSection.children.push(grid)

  // ---------- 应用示例 ----------
  const sample = frame('应用示例', {
    layout: 'horizontal',
    gap: 0,
    width: 'fill_container',
    cornerRadius: '$radius-lg',
    fill: '$surface',
    stroke: '$border',
    strokeWidth: 1,
    strokeAlignment: 'inner',
    clip: true,
  })

  const sidebar = frame('Sidebar', { layout: 'vertical', gap: 8, width: 220, padding: 20, fill: '$bg' })
  sidebar.children.push(text('Side Title', '供应商', { fontFamily: BODY, fontSize: '$font-size-xs', fontWeight: 'bold', fill: '$text-subtle' }))
  for (const [label, active] of [['智谱 GLM', true], ['OpenAI', false], ['Ollama', false]]) {
    const item = frame(`Nav ${label}`, {
      gap: 8,
      alignItems: 'center',
      padding: [8, 10],
      cornerRadius: '$radius-md',
      fill: active ? '$surface-hover' : '$surface',
    })
    item.children.push(
      box('ellipse', 'Dot', { width: 6, height: 6, fill: active ? '$success' : '$text-subtle' }),
      text('Label', label, { fontFamily: BODY, fontSize: '$font-size-sm', fill: active ? '$text' : '$text-muted' }),
    )
    sidebar.children.push(item)
  }
  sample.children.push(sidebar)

  const content = frame('Content', { layout: 'vertical', gap: 16, width: 'fill_container', padding: 20 })
  content.children.push(
    text('Title', '模型设置', { fontFamily: BODY, fontSize: '$font-size-xl', fontWeight: 'bold', fill: '$text' }),
    text('Body', '接入本地与云端模型服务，配置 API Key、Base URL 与默认档案。', {
      textGrowth: 'fixed-width',
      width: 'fill_container',
      fontFamily: BODY,
      fontSize: '$font-size-sm',
      fill: '$text-muted',
      lineHeight: '$line-height',
    }),
  )

  const table = frame('Table', {
    layout: 'vertical',
    gap: 0,
    width: 'fill_container',
    cornerRadius: '$radius-md',
    fill: '$input',
    stroke: '$border',
    strokeWidth: 1,
    strokeAlignment: 'inner',
    clip: true,
  })
  const headRow = frame('Row Header', { gap: 16, padding: [10, 14], fill: '$surface-raised' })
  headRow.children.push(
    text('H1', '模型', { fontFamily: BODY, fontSize: '$font-size-xs', fontWeight: 'bold', fill: '$text-subtle', width: 180, textGrowth: 'fixed-width' }),
    text('H2', '状态', { fontFamily: BODY, fontSize: '$font-size-xs', fontWeight: 'bold', fill: '$text-subtle' }),
  )
  table.children.push(headRow)
  for (const [name, tone, label] of [['GLM-5.3', '$success', '已连接'], ['GLM-4.6', '$warning', '待更新']]) {
    const row = frame(`Row ${name}`, {
      gap: 16,
      padding: [10, 14],
      alignItems: 'center',
      stroke: '$border',
      strokeWidth: { top: 1 },
      strokeAlignment: 'inner',
    })
    const badge = frame('Badge', { padding: [3, 8], cornerRadius: '$radius-sm', fill: `${tone}-soft` })
    badge.children.push(text('Label', label, { fontFamily: BODY, fontSize: '$font-size-xs', fill: tone }))
    row.children.push(
      text('Name', name, { fontFamily: BODY, fontSize: '$font-size-sm', fill: '$text', width: 180, textGrowth: 'fixed-width' }),
      badge,
    )
    table.children.push(row)
  }
  content.children.push(table)
  sample.children.push(content)
  compSection.children.push(sample)
  screen.children.push(compSection)

}
