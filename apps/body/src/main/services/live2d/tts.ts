type NeuralRequest = { kind: string; topic: string; payload?: unknown }
type NeuralTrigger = (request: NeuralRequest) => Promise<any>

const errorMessage = (response: any, fallback: string): string =>
  response?.data?.error?.message || response?.error?.message || response?.msg || fallback

/** Discover through the category contract; no engine IDs or Python paths in Body. */
export async function requestTtsSynthesis(
  input: string,
  trigger: NeuralTrigger
): Promise<{ audioUrl: string }> {
  const text = typeof input === 'string' ? input.trim() : ''
  if (!text) throw new Error('请输入要播放的文本')
  if (text.length > 2000) throw new Error('文本不能超过 2000 字')

  const discovery = await trigger({
    kind: 'query',
    topic: 'motor.tool.list',
    payload: { category: 'tts', detailed: true }
  })
  if (!discovery?.success) throw new Error(errorMessage(discovery, '查询语音插件失败'))
  const tools = discovery.data?.tools
  const tool =
    Array.isArray(tools) &&
    tools.find(
      (item: any) =>
        ['ready', 'running'].includes(item.status) && item.capabilities?.includes('tts.synthesize')
    )
  if (!tool) throw new Error('没有可用的语音插件，请先启用 TTS 插件')

  const response = await trigger({
    kind: 'command',
    topic: 'motor.tool.execute',
    payload: { tool: tool.id, capability: 'tts.synthesize', parameters: { text, format: 'wav' } }
  })
  if (!response?.success || !response.data?.success) {
    throw new Error(errorMessage(response, '语音合成失败'))
  }
  const audioUrl = response.data.data?.audioUrl
  let url: URL
  try {
    url = new URL(audioUrl)
  } catch {
    throw new Error('语音插件没有返回有效的音频地址')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('语音插件返回了不支持的音频地址')
  }
  return { audioUrl: url.href }
}
