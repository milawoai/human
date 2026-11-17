import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error Node's strip-types runner requires the .ts extension.
import { requestTtsSynthesis } from './tts.ts'

test('discovers a ready TTS plugin and unwraps Neural plus ToolResult', async () => {
  const calls: any[] = []
  const result = await requestTtsSynthesis('  你好  ', async (request) => {
    calls.push(request)
    if (request.topic === 'motor.tool.list') {
      return {
        success: true,
        data: {
          tools: [
            { id: 'offline', status: 'error', capabilities: ['tts.synthesize'] },
            { id: 'external-tts', status: 'ready', capabilities: ['tts.synthesize'] }
          ]
        }
      }
    }
    return {
      success: true,
      data: {
        success: true,
        data: {
          audioUrl: 'http://127.0.0.1:12002/tts-cache/external-tts/test.wav'
        }
      }
    }
  })
  assert.equal(result.audioUrl, 'http://127.0.0.1:12002/tts-cache/external-tts/test.wav')
  assert.deepEqual(calls[0].payload, { category: 'tts', detailed: true })
  assert.deepEqual(calls[1].payload, {
    tool: 'external-tts',
    capability: 'tts.synthesize',
    parameters: { text: '你好', format: 'wav' }
  })
})

test('rejects blank and overly long input before requesting the backend', async () => {
  const trigger = async () => {
    throw new Error('backend should not be called')
  }
  await assert.rejects(requestTtsSynthesis('  ', trigger), /请输入/)
  await assert.rejects(requestTtsSynthesis('字'.repeat(2001), trigger), /2000/)
})

test('reports missing plugin and discovery errors', async () => {
  await assert.rejects(
    requestTtsSynthesis('你好', async () => ({ success: true, data: { tools: [] } })),
    /没有可用/
  )
  await assert.rejects(
    requestTtsSynthesis('你好', async () => ({ success: false, msg: '后端未就绪' })),
    /后端未就绪/
  )
})

test('preserves nested plugin errors and rejects invalid audio URLs', async () => {
  for (const [response, pattern] of [
    [
      { success: false, data: { success: false, error: { message: '模型加载失败' } } },
      /模型加载失败/
    ],
    [{ success: true, data: { success: false, error: { message: '合成失败' } } }, /合成失败/],
    [{ success: true, data: { success: true, data: {} } }, /音频/],
    [{ success: true, data: { success: true, data: { audioUrl: 'javascript:bad' } } }, /音频/]
  ] as const) {
    await assert.rejects(
      requestTtsSynthesis('你好', async (request) =>
        request.topic === 'motor.tool.list'
          ? {
              success: true,
              data: { tools: [{ id: 'test', status: 'ready', capabilities: ['tts.synthesize'] }] }
            }
          : response
      ),
      pattern
    )
  }
})
