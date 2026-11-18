import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node strip-types import.
import { ThemeReceiver } from './theme-receiver.ts'
test('late initial query cannot overwrite a newer live theme event', () => {
  const applied: string[] = []
  const receiver = new ThemeReceiver(value => applied.push(value.id))
  receiver.accept({ id: 'dark', fontScale: 1, revision: 0 })
  receiver.accept({ id: 'light', fontScale: 1.125, revision: 2 })
  receiver.accept({ id: 'dark', fontScale: 1, revision: 1 })
  assert.deepEqual(applied, ['dark', 'light'])
  assert.throws(() => receiver.accept({ id: 'unknown', fontScale: 1, revision: 3 } as any))
})
