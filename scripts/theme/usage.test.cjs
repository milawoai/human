const { test } = require('node:test')
const assert = require('node:assert/strict')
const { analyzeSource, compareBaseline, summarize, baselineExpansion } = require('./usage-scan.cjs')
test('theme variables pass; CSS literals, fallback fonts and local overrides fail', () => {
  const good = `<template><p :style="{color: 'var(--human-text)'}">Hi</p></template><style scoped>.x {color:var(--human-text);font-size:var(--human-text-base);font-family:var(--human-font-body);width:320px;background:transparent}</style>`
  assert.deepEqual(analyzeSource('pages/new.vue', good), [])
  const bad = `<template><div /></template><style>.x {color:#fff;background:rgb(1,2,3);font-size:14px;font-family:Arial;--human-bg:var(--human-surface);border-color:var(--surface-border)}</style>`
  const rules = analyzeSource('pages/new.vue', bad).map(issue => issue.rule)
  for (const rule of ['literal-color', 'literal-font-size', 'literal-font-family', 'theme-override', 'foreign-theme-variable']) assert(rules.includes(rule), rule)
})
test('template inline styles, utility classes and script expressions are covered; selectors are not colors', () => {
  const bad = `<script setup>const a={ fontSize:14,color:'#fafafa' }; const b='text-red-500'; document.querySelector('#fff')</script><template><div style="color:white" :style="{fontFamily:'Arial'}" :class="{'bg-blue-500':true}" class="bg-black text-sm" /></template>`
  const issues = analyzeSource('new.vue', bad)
  assert(issues.some(issue => issue.rule === 'literal-font-size'))
  assert(issues.some(issue => issue.rule === 'literal-font-family'))
  assert(issues.some(issue => issue.rule === 'utility-theme'))
  assert(issues.some(issue => issue.value === 'bg-blue-500'))
  assert(issues.some(issue => issue.rule === 'literal-color' && issue.value === 'white'))
  assert(!issues.some(issue => issue.value === '#fff'))
})
test('inventing a theme variable or using a static color template string cannot bypass the guard', () => {
  const issues = analyzeSource('x.vue', '<script setup>const color = `#fff`</script><style>.x{color:var(--human-missing)}</style>')
  assert(issues.some(issue => issue.rule === 'unknown-theme-variable'))
  assert(issues.some(issue => issue.rule === 'literal-color'))
})
test('baseline only tolerates the exact legacy declarations and counts; new files have no waiver', () => {
  const old = analyzeSource('old.vue', '<template><div /></template><style>.old{color:#fff}</style>')
  const baseline = summarize(old)
  assert.deepEqual(compareBaseline(old, baseline), [])
  assert(compareBaseline([...old,...old], baseline).some(issue => issue.rule === 'literal-color'))
  assert(compareBaseline(analyzeSource('new.vue','<template><div /></template><style>.old{color:#fff}</style>'), baseline).some(issue => issue.rule === 'literal-color'))
  assert(compareBaseline(analyzeSource('old.vue','<template><div /></template><style>.new{color:#fff}</style>'), baseline).some(issue => issue.rule === 'literal-color'))
  assert(compareBaseline([], baseline).some(issue => issue.rule === 'stale-baseline'))
})
test('comments do not create findings and an unknown syntax never silently skips checks', () => {
  assert.deepEqual(analyzeSource('x.css', '/*color:#fff;*/ .x{color:var(--human-text)}'), [])
  assert(analyzeSource('x.vue', '<template><div /></template><style>.x{color:#fff</style>').some(issue => issue.rule === 'parse-error'))
})
test('CI policy accepts only shrinking a baseline, never adding new entries or counts', () => {
  const old = { 'old.vue': { a: 2 } }
  assert.equal(baselineExpansion({ 'old.vue': { a: 1 } }, old), false)
  assert.equal(baselineExpansion({ 'old.vue': { a: 3 } }, old), true)
  assert.equal(baselineExpansion({ 'new.vue': { a: 1 } }, old), true)
  assert.equal(baselineExpansion({ 'old.vue': { b: 1 } }, old), true)
})
test('utility modifiers and arbitrary-value syntax still obey the theme contract', () => {
  const issues = analyzeSource('x.vue', `<template><div class="dark:text-sm/6 bg-[color:#fff] font-['Arial']" /></template>`)
  assert.equal(issues.filter(issue => issue.rule === 'utility-theme').length, 3)
})
