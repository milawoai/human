const { readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join, relative } = require('node:path')
const { execFileSync } = require('node:child_process')
const { analyzeSource, compareBaseline, summarize, baselineExpansion } = require('./theme/usage-scan.cjs')
const root = join(__dirname, '..'), source = join(root, 'apps/body/src/renderer/src')
const baselinePaths = ['scripts/theme/usage-baseline.json', 'scripts/theme/usage-layout-baseline.json']
const baselines = baselinePaths.map(path => JSON.parse(readFileSync(join(root, path), 'utf8')))
let files = 0, issues = []
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) scan(path)
    else if (entry.isFile() && /\.(vue|css|scss|less|js|ts|jsx|tsx)$/.test(path) && !path.endsWith('.d.ts')) {
      files++; issues.push(...analyzeSource(relative(source, path).split('\\').join('/'), readFileSync(path, 'utf8')))
    }
  }
}
try {
  scan(source)
  const args = process.argv.slice(2), base = args[args.indexOf('--base-ref') + 1]
  for (const [index, baselinePath] of baselinePaths.entries()) {
    const baseline = baselines[index]
    const currentIssues = issues.filter(issue => /^(literal-spacing|literal-radius|utility-spacing)$/.test(issue.rule) === (index === 1))
    if (args.includes('--base-ref')) {
      if (!base || base.startsWith('-') || !/^[\w./-]+$/.test(base)) throw Error('Invalid baseline comparison ref')
      execFileSync('git', ['cat-file', '-e', base + '^{commit}'], { cwd: root, stdio: 'pipe' })
      let previousText
      try { previousText = execFileSync('git', ['show', `${base}:${baselinePath}`], { cwd: root, stdio: ['ignore','pipe','ignore'], encoding: 'utf8' }) }
      catch { /* The initial introduction has no prior baseline. */ }
      if (previousText && baselineExpansion(baseline.allowances, JSON.parse(previousText).allowances)) throw Error('Baseline expansion forbidden')
    }
    if (process.argv.includes('--prune-baseline') && !issues.some(issue => issue.rule === 'parse-error')) {
      const actual = summarize(currentIssues), reduced = {}
      for (const [file, counts] of Object.entries(baseline.allowances)) for (const [key, count] of Object.entries(counts)) {
        const keep = Math.min(count, actual[file]?.[key] || 0)
        if (keep) (reduced[file] ??= {})[key] = keep
      }
      baseline.allowances = reduced
      writeFileSync(join(root, baselinePath), JSON.stringify(baseline, null, 2) + '\n')
    }
    const failures = compareBaseline(currentIssues, baseline.allowances)
    for (const issue of failures) console.error(`${issue.file}:${issue.line} ${issue.rule} ${issue.context}: ${issue.value}`)
    if (failures.length) {
      console.error('FAIL: use --human-* theme tokens; do not expand the legacy baseline. After fixing legacy styles, prune it with --prune-baseline.')
      process.exitCode = 1
    }
  }
  if (!process.exitCode) console.log(`PASS: theme usage (${files} files, ${issues.length} frozen legacy findings; no new violations)`)
} catch (error) { console.error(`Theme usage check failed: ${error.message}`); process.exitCode = 1 }
