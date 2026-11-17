import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error Node's strip-types runner requires the .ts extension here.
import { runStartupSettings } from './startupSettings.ts'

test('opens Live2D before waiting for server startup', async () => {
  const events: string[] = []
  let resolveServer: (() => void) | undefined

  await runStartupSettings(
    {
      openLive2DOnStart: true,
      startServerOnStart: true,
      selectedModelId: 'mao_pro'
    },
    {
      openLive2D: () => {
        events.push('openLive2D')
      },
      startServer: () => {
        events.push('startServer')
        return new Promise<void>((resolve) => {
          resolveServer = resolve
        })
      },
      refreshTrayMenu: async () => {
        events.push('refreshTrayMenu')
      },
      onServerStartError: () => {
        events.push('serverError')
      }
    }
  )

  assert.deepEqual(events, ['openLive2D', 'startServer'])

  resolveServer?.()
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(events, ['openLive2D', 'startServer', 'refreshTrayMenu'])
})
