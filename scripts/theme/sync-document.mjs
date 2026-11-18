import { buildVariables, themeAxes } from './tokens.mjs'
const aliases = {
  'bg-app': 'bg', 'bg-panel': 'surface', 'bg-surface': 'surface-raised', 'bg-elevated': 'surface-hover',
  'text-primary': 'text', 'text-secondary': 'text-muted', 'text-muted': 'text-subtle',
  'accent-dim': 'accent-soft', gold: 'warning', green: 'success',
  'font-ui': 'font-body', font: 'font-body', mono: 'font-mono'
}
const paints = { '#0B1220': '$on-accent', '#FF5F57': '$danger', '#FEBC2E': '$warning', '#28C840': '$success' }
const paintKeys = new Set(['fill', 'color', 'stroke', 'background'])
export function synchronizeDocument(input, tokens) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.children)) throw Error('Invalid JSON .pen document')
  const document = structuredClone(input)
  const variables = document.variables ?? {}
  const legacy = Object.keys(aliases).some(key => key !== 'text-muted' && Object.hasOwn(variables, key))
  const sizes = Object.entries(tokens.common['font-size-px'])
  const paint = value => typeof value === 'string' ? value : value?.color
  const usesOnAccent = node => node && typeof node === 'object' &&
    (paint(node.fill) === '$on-accent' || node.color === '$on-accent' || node.children?.some(usesOnAccent))
  function walk(node) {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (['content', 'name', 'id', 'ref'].includes(key)) continue
      if (typeof value === 'string' && legacy && aliases[value.slice(1)] && value.startsWith('$')) node[key] = '$' + aliases[value.slice(1)]
      else if (typeof value === 'string' && paintKeys.has(key) && paints[value.toUpperCase()]) node[key] = paints[value.toUpperCase()]
      else walk(value)
    }
    if (node.type === 'text' && typeof node.fontSize === 'number' && node.fontSize > 0) {
      const [role] = [...sizes].sort((a, b) => Math.abs(a[1] - node.fontSize) - Math.abs(b[1] - node.fontSize))[0]
      node.fontSize = '$font-size-' + role
    }
    if (paint(node.fill) === '$accent' && node.children?.some(usesOnAccent)) {
      node.fill = typeof node.fill === 'string' ? '$accent-strong' : { ...node.fill, color: '$accent-strong' }
    }
  }
  walk(document.children)
  if (legacy) {
    walk(variables)
    for (const key of Object.keys(aliases)) if (key !== 'text-muted') delete variables[key]
  }
  document.variables = { ...variables, ...buildVariables(tokens) }
  document.themes = { ...document.themes, ...themeAxes(tokens) }
  function validate(node) {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (['content', 'name', 'id', 'ref'].includes(key)) continue
      if (typeof value === 'string' && /^\$[\w-]+$/.test(value) && !Object.hasOwn(document.variables, value.slice(1))) throw Error(`Undefined theme variable: ${value}`)
      validate(value)
    }
  }
  validate(document.children)
  validate(document.variables)
  return document
}
