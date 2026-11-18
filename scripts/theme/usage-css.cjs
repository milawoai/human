const postcss = require('postcss')
const names = require('color-name')
const colors = new Set(Object.keys(names.default || names))
const tokens = require('../../designs/theme.tokens.json')
const known = new Set([...Object.entries(tokens.common).filter(([, value]) => typeof value === 'string').map(([key]) => key), ...Object.keys(tokens.themes.dark.tokens), 'root-size', ...Object.keys(tokens.common['font-size-px']).map(key => 'text-' + key)].map(key => '--human-' + key))
function themeReferences(value, context, line, emit) {
  for (const match of value.matchAll(/var\(\s*(--human-[\w-]+)/g)) if (!known.has(match[1])) emit({ rule: 'unknown-theme-variable', context, value: match[1], line })
}
const paintProperty = /color|background|border|shadow|outline|fill|stroke|caret|accent|decoration/i
function colorLiterals(value) {
  const source = value.replace(/url\([^)]*\)/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  const values = source.match(/#[\da-f]{3,8}\b|\b(?:rgb|hsl|hwb|lab|lch|oklab|oklch|color)\([^)]*\)|\b[a-z]+\b/gi) || []
  return values.filter(value => value.startsWith('#') || (/\(/.test(value) && !/var\(--human-/.test(value)) || colors.has(value.toLowerCase()))
}
function declaration(property, value, context, line, emit, bridge = false) {
  const prop = property.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())
  const report = (rule, detail = value) => emit({ rule, context: `${context}/${prop}`, value: String(detail), line })
  themeReferences(value, `${context}/${prop}`, line, emit)
  if (prop.startsWith('--human-')) report('theme-override')
  if (!bridge && /var\(\s*--(?!human-)/.test(value)) report('foreign-theme-variable')
  if (paintProperty.test(prop)) for (const color of colorLiterals(value)) report('literal-color', color)
  if (prop === 'font-size' && !/^(inherit|initial|unset|revert|1em|0)$/.test(value.trim())) {
    if (!/var\(--human-/.test(value) || /[\d.]\s*(px|rem|em|pt|vh|vw|%)/.test(value)) report('literal-font-size')
  }
  if (prop === 'font-family' && !/^(inherit|initial|unset|revert)$/.test(value.trim()) && !/^var\(--human-font-[\w-]+\)$/.test(value.trim())) report('literal-font-family')
  if (prop === 'font') {
    if (/[\d.]\s*(px|rem|pt|vh|vw)/.test(value)) report('literal-font-size')
    if (value !== 'inherit' && !/var\(--human-font-/.test(value)) report('literal-font-family')
  }
}
function stylesheet(source, label, emit, bridge = false) {
  const root = postcss.parse(source.replace(/^\s*\/\/[^\n]*/gm, ''), { from: label })
  root.walkDecls(node => {
    if (node.parent.type === 'atrule' && node.parent.name === 'font-face') return
    const ancestors = []; let parent = node.parent
    while (parent && parent.type !== 'root') { ancestors.unshift(parent.selector || `@${parent.name} ${parent.params || ''}`); parent = parent.parent }
    declaration(node.prop, node.value, `${label}:${ancestors.join(' ')}`, node.source.start.line, emit, bridge)
  })
}
function utilities(value, context, line, emit) {
  for (const word of value.split(/\s+/)) {
    let depth = 0, start = 0
    for (let index = 0; index < word.length; index++) {
      if (word[index] === '[') depth++
      else if (word[index] === ']') depth--
      else if (word[index] === ':' && depth === 0) start = index + 1
    }
    const token = word.slice(start)
    if (/var\(--human-|\(--human-/.test(token)) continue
    const paint = /^(bg|text|border|ring|fill|stroke|decoration|outline)-(?:\[|black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-)/.test(token)
    const type = /^(text-(xs|sm|base|lg|xl|\d+xl)(\/[^ ]+)?$|font-(sans|serif|mono|\[))/.test(token)
    if (paint || type) emit({ rule: 'utility-theme', context, value: word, line })
  }
}
module.exports = { colorLiterals, declaration, stylesheet, utilities, themeReferences }
