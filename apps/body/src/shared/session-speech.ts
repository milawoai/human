interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const key = (sessionId: string) => `human:speech-summary:${sessionId}`

export function readSpeechPreference(storage: PreferenceStorage, sessionId: string, fallback = false): boolean {
  try {
    const value = storage.getItem(key(sessionId))
    return value === null ? fallback === true : value === 'true'
  } catch { return false }
}

export function saveSpeechPreference(storage: PreferenceStorage, sessionId: string, enabled: boolean): void {
  storage.setItem(key(sessionId), enabled === true ? 'true' : 'false')
}

/** Only the caller's still-current request may play; speech never changes text success. */
export async function playSessionSpeech(
  speech: any,
  isCurrent: () => boolean,
  perform: (payload: { text: string; audioUrl: string }) => Promise<any>
): Promise<string> {
  if (!isCurrent() || !speech) return ''
  if (speech.status === 'failed') return `总结播报失败：${speech.error || '语音合成失败'}`
  if (speech.status !== 'ready' || typeof speech.summary !== 'string' || !speech.summary.trim() || Array.from(speech.summary).length > 80) return ''
  try {
    const url = new URL(speech.audioUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    const result = await perform({ text: speech.summary, audioUrl: url.href })
    if (result?.data?.audioPlayed === false) return `总结播报失败：${result.data.audioError || '音频未能播放'}`
    return result?.success === false ? `总结播报失败：${result.msg || '播放失败'}` : ''
  } catch (error) { return `总结播报失败：${error instanceof Error ? error.message : String(error)}` }
}
