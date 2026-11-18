const { parse } = require('@vue/compiler-sfc')
const { createHash } = require('node:crypto')
const { stylesheet, utilities } = require('./usage-css.cjs')
const { script } = require('./usage-script.cjs')
function analyzeSource(file, source) {
  const issues = [], emit = issue => issues.push({ file, ...issue })
  const bridge = file === 'theme/theme.css', central = file === 'theme/index.ts'
  try {
    if (file.endsWith('.vue')) {
      const { descriptor, errors } = parse(source, { filename: file })
      if (errors.length) throw Error(String(errors[0]))
      descriptor.styles.forEach((style, index) => stylesheet(style.content, `style${index}`, emit))
      for (const block of [descriptor.script, descriptor.scriptSetup]) if (block) script(block.content, 'script', emit)
      const template = descriptor.template?.ast
      function walk(node) {
        if (!node || typeof node !== 'object') return
        for (const prop of node.props || []) {
          if (prop.type === 6 && prop.name === 'style') stylesheet(`x{${prop.value?.content || ''}}`, 'inline', emit)
          if (prop.type === 6 && prop.name === 'class') utilities(prop.value?.content || '', 'class', prop.loc.start.line, emit)
          if (prop.type === 7 && ['style','class'].includes(prop.arg?.content) && prop.exp) script(prop.exp.content, 'binding', emit, false, true)
        }
        for (const child of node.children || []) walk(child)
      }
      walk(template)
    } else if (/\.(css|scss|less)$/.test(file)) stylesheet(source, file, emit, bridge)
    else script(source, file, emit, central)
  } catch (error) { emit({ rule: 'parse-error', context: file, value: error.message, line: 1 }) }
  return issues
}
function fingerprint(issue) { return createHash('sha256').update([issue.rule, issue.context, issue.value.replace(/\s+/g,' ').trim()].join('|')).digest('hex').slice(0,24) }
function summarize(issues) {
  const result = {}
  for (const issue of issues) { const bucket = result[issue.file] ??= {}; const key = fingerprint(issue); bucket[key] = (bucket[key] || 0) + 1 }
  return result
}
function compareBaseline(issues, baseline) {
  const used = {}, failures = []
  for (const issue of issues) {
    const bucket = used[issue.file] ??= {}, key = fingerprint(issue)
    bucket[key] = (bucket[key] || 0) + 1
    if (issue.rule === 'parse-error' || bucket[key] > (baseline[issue.file]?.[key] || 0)) failures.push(issue)
  }
  for (const [file, counts] of Object.entries(baseline)) for (const [key, count] of Object.entries(counts)) {
    if (count > (used[file]?.[key] || 0)) failures.push({ file, rule: 'stale-baseline', line: 1, context: key, value: '旧违规已减少，只允许收缩基线，不能保留空余豁免' })
  }
  return failures
}
function baselineExpansion(current, previous) {
  return Object.entries(current).some(([file, counts]) => Object.entries(counts).some(([key, count]) => count > (previous[file]?.[key] || 0)))
}
module.exports = { analyzeSource, fingerprint, summarize, compareBaseline, baselineExpansion }
