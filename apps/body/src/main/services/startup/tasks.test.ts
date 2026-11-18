import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node strip-types import.
import { runStartupTasks } from './tasks.ts'
// @ts-expect-error Node strip-types import.
import { StartupProgress } from './progress.ts'
// @ts-expect-error Node strip-types import.
import { startupStages } from '../../../shared/startup.ts'
test('brain readiness advances capabilities before backend startup finishes', async () => {
  const progress = new StartupProgress(startupStages)
  await runStartupTasks(progress, async () => {}, async ready => {
    assert.equal(progress.snapshot().message, '大脑准备中')
    ready()
    assert.equal(progress.snapshot().message, '能力装填中')
    assert.equal(progress.snapshot().stages[1].message, '大脑已醒来')
  })
  assert.equal(progress.snapshot().message, '能力已装填')
})
test('business initialization failure cannot show brain awake or capabilities loaded', async () => {
  const progress = new StartupProgress(startupStages)
  await runStartupTasks(progress, async () => {}, async ready => { ready('业务初始化失败') })
  assert.equal(progress.snapshot().state, 'failed')
  assert.equal(progress.snapshot().message, '业务初始化失败')
  assert.notEqual(progress.snapshot().stages[1].state, 'done')
})
