import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node strip-types needs a .ts extension.
import { installAsyncQuit } from './shutdown.ts'
// @ts-expect-error Node strip-types needs a .ts extension.
import { RecoveryBudget } from './recovery-budget.ts'

test('reentrant quit requests wait for one cleanup before final quit', async () => {
  let listener!: (event: { preventDefault(): void }) => void
  let finished!: () => void
  const cleanup = new Promise<void>(resolve => { finished = resolve })
  let calls = 0, quits = 0, prevented = 0
  installAsyncQuit({ on: (_event: string, fn: typeof listener) => { listener = fn }, quit: () => { quits++ } },
    async () => { calls++; await cleanup }, () => {})
  const event = { preventDefault: () => { prevented++ } }
  listener(event); listener(event)
  await Promise.resolve()
  assert.equal(calls, 1); assert.equal(quits, 0); assert.equal(prevented, 2)
  finished()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(quits, 1)
  listener(event)
  assert.equal(prevented, 2)
})

test('restart budget bounds retries and expires old attempts', () => {
  const budget = new RecoveryBudget()
  assert.equal(budget.take(0), true)
  assert.equal(budget.take(1), true)
  assert.equal(budget.take(2), true)
  assert.equal(budget.take(3), false)
  assert.equal(budget.take(300000), true)
})

test('platform shutdown requests ordinary bounded quit, hiding windows does not', async () => {
  // @ts-expect-error Node strip-types needs a .ts extension.
  const { installSessionQuit } = await import('./shutdown.ts')
  let handler!: (...args: any[]) => void
  let prevented = false, quit = false
  installSessionQuit({ on: (_event: string, listener: typeof handler) => { handler = listener } }, { quit: () => { quit = true } })
  assert.equal(quit, false)
  handler({ preventDefault: () => { prevented = true } })
  assert(prevented && quit)
})
