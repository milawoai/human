import { createHmac, timingSafeEqual } from 'node:crypto'
import { isAbsolute } from 'node:path'

export type DesktopApproval = {
  approvalId: string; jobId: string; seq: number; expiresAt: number
  operation: 'read' | 'write' | 'ls'; path: string
}
export type DesktopDecision = 'once' | 'directory' | 'deny'
export interface DesktopApprovalHooks {
  ask(request: DesktopApproval, signal: AbortSignal): Promise<DesktopDecision>
  persist(request: DesktopApproval): void
}

export function createApprovalFrames(token: string, instanceId: string,
  write: (line: string) => void, hooks?: DesktopApprovalHooks) {
  let active: { request: DesktopApproval; controller: AbortController; decision?: DesktopDecision } | undefined
  const close = () => { active?.controller.abort(); active = undefined }
  return {
    close,
    consume(line: string): boolean {
      const prefix = '[human-job-approval] '
      if (!line.startsWith(prefix)) return false
      if (!hooks) return true
      const match = /^([a-f0-9]{64}) (.+)$/.exec(line.slice(prefix.length))
      if (!match) return true
      const expected = createHmac('sha256', token).update(match[2]).digest()
      if (!timingSafeEqual(expected, Buffer.from(match[1], 'hex'))) return true
      try {
        const frame = JSON.parse(match[2]) as DesktopApproval & { instanceId: string; type: string }
        if (frame.instanceId !== instanceId) return true
        if (frame.type === 'job-approval-close' && active?.request.approvalId === frame.approvalId) close()
        if (frame.type === 'job-approval-persist' && active?.request.approvalId === frame.approvalId
          && active.decision === 'directory') {
          const request = active.request
          close()
          hooks.persist(request)
        }
        if (frame.type === 'job-approval' && !active && /^[\da-f-]{36}$/.test(frame.approvalId)
          && /^[\da-f-]{36}$/.test(frame.jobId) && Number.isSafeInteger(frame.seq)
          && Number.isSafeInteger(frame.expiresAt) && frame.expiresAt > Date.now()
          && ['read', 'write', 'ls'].includes(frame.operation) && isAbsolute(frame.path)) {
          const pending = { request: frame, controller: new AbortController(), decision: undefined as DesktopDecision | undefined }
          active = pending
          void hooks.ask(frame, pending.controller.signal).catch(() => 'deny' as const).then(decision => {
            if (active !== pending || Date.now() >= frame.expiresAt) return
            pending.decision = decision
            write(JSON.stringify({ type: 'job-approval-decision', instanceId, approvalId: frame.approvalId,
              seq: frame.seq, decision }) + '\n')
          })
        }
      } catch { /* Malformed frames are never passed to diagnostics. */ }
      return true
    },
  }
}
