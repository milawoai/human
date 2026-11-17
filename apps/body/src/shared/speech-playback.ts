export interface SpeechPlaybackTicket { scope: string; token: string }

/** Main-process lease state. Empty token invalidates pending, not already playing, audio. */
export class SpeechPlaybackGate {
  private tokens = new Map<string, string>()
  set(ticket: SpeechPlaybackTicket): void {
    if (!['chat-panel', 'agent-panel'].includes(ticket?.scope) || typeof ticket.token !== 'string' || ticket.token.length > 200) throw new Error('播报令牌不合法')
    this.tokens.set(ticket.scope, ticket.token)
  }
  current(ticket: SpeechPlaybackTicket): boolean {
    return !!ticket?.token && this.tokens.get(ticket.scope) === ticket.token
  }
}

/** Call at the actual playback boundary, after all asynchronous preparation. */
export async function startSpeechPlayback(
  ticket: SpeechPlaybackTicket | undefined,
  isCurrent: (ticket: SpeechPlaybackTicket) => Promise<boolean>,
  start: () => Promise<void>
): Promise<boolean> {
  if (ticket && !await isCurrent(ticket)) return false
  await start()
  return true
}
