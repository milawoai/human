const { babelParse } = require('@vue/compiler-sfc')
const { colorLiterals, declaration, stylesheet, utilities, themeReferences } = require('./usage-css.cjs')
const property = node => node?.name || node?.value || ''
function script(source, label, emit, central = false, expression = false) {
  const root = babelParse(expression ? `(${source})` : source, { sourceType: 'module', plugins: ['typescript', ...(label.endsWith('tsx') || label.endsWith('jsx') ? ['jsx'] : [])] })
  function visit(node, context = '', parent) {
    if (!node || typeof node !== 'object') return
    let role = context
    if (node.type === 'ObjectProperty') role = property(node.key)
    if (node.type === 'AssignmentExpression') role = property(node.left?.property)
    if (node.type === 'CallExpression' && property(node.callee?.property) === 'setProperty') role = node.arguments[0]?.value || context
    if (['StringLiteral', 'NumericLiteral', 'TemplateElement'].includes(node.type)) {
      const value = String(node.type === 'TemplateElement' ? node.value.cooked : node.value), line = node.loc?.start.line || 1
      const isKey = parent?.type === 'ObjectProperty' && parent.key === node
      const selector = parent?.type === 'CallExpression' && /^(querySelector|querySelectorAll|getElementById)$/.test(property(parent.callee?.property))
      if (!isKey && !selector) {
        if (role && /^(font|fontSize|fontFamily|font-size|font-family|padding\w*|margin\w*|gap|rowGap|columnGap|borderRadius)$/.test(role)) declaration(role, value, label, line, emit)
        else for (const color of colorLiterals(value)) if (color === value) emit({ rule: 'literal-color', context: `${label}:${role}`, value, line })
        themeReferences(value, `${label}:${role}`, line, emit)
        if (/var\(\s*--(?!human-)/.test(value)) emit({ rule: 'foreign-theme-variable', context: label, value, line })
        if (/^(color|background|font-size|font-family)\s*:/.test(value)) stylesheet(`x{${value}}`, label, emit)
      }
      utilities(value, `${label}:${role}`, line, emit)
      if (!central && value === 'app-dark' && parent?.type === 'CallExpression') emit({ rule: 'local-theme-switch', context: label, value, line })
      if (!central && value.startsWith('--human-') && parent?.type === 'CallExpression' && property(parent.callee?.property) === 'setProperty') emit({ rule: 'theme-override', context: label, value, line })
    }
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'comments', 'extra'].includes(key)) continue
      if (Array.isArray(child)) child.forEach(value => visit(value, role, node))
      else if (child && typeof child === 'object') visit(child, role, node)
    }
  }
  visit(root)
}
module.exports = { script }
