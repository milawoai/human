import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node strip-types import.
import { StartupProgress } from './progress.ts'

test('new stages report actual ordered progress and keep completed messages', () => {
  const progress = new StartupProgress([
    { id: 'brain', loading: '大脑准备中', ready: '大脑已醒来' },
    { id: 'cache', loading: '缓存准备中', ready: '缓存已就绪' }
  ])
  progress.begin('brain')
  assert.equal(progress.snapshot().message, '大脑准备中')
  progress.complete('brain')
  progress.begin('cache')
  assert.equal(progress.snapshot().stages[0].message, '大脑已醒来')
  progress.complete('cache')
  assert.equal(progress.snapshot().message, '缓存已就绪')
  assert.equal(progress.snapshot().state, 'done')
})
test('failure stays visible and snapshots cannot mutate main-process state', () => {
  const progress = new StartupProgress([{ id: 'brain', loading: '准备', ready: '醒来' }])
  progress.begin('brain')
  progress.fail('配置不可用')
  assert.equal(progress.snapshot().state, 'failed')
  assert.equal(progress.snapshot().message, '配置不可用')
  progress.snapshot().stages[0].message = '伪造'
  assert.notEqual(progress.snapshot().stages[0].message, '伪造')
  assert.throws(() => progress.begin('missing'))
})
test('extension tasks complete only after their real async load settles', async () => {
  const progress = new StartupProgress([{ id: 'cache', loading: '缓存准备中', ready: '缓存已就绪' }])
  let release!: () => void
  const loading = progress.run('cache', () => new Promise<void>(resolve => { release = resolve }))
  assert.equal(progress.snapshot().message, '缓存准备中')
  release()
  await loading
  assert.equal(progress.snapshot().message, '缓存已就绪')
  const failed = new StartupProgress([{ id: 'cache', loading: '缓存准备中', ready: '缓存已就绪' }])
  await assert.rejects(failed.run('cache', async () => { throw Error('offline') }), /offline/)
  assert.equal(failed.snapshot().state, 'failed')
})
