// @ts-expect-error Node strip-types tests require a .ts import.
import { buildAgentRequest, unwrapAgentResponse } from '../../../shared/agent-panel.ts'
import type { AgentRunInput } from '../../../shared/agent-panel'

interface AgentDependencies {
  observe: (receive: (message: any) => void) => Promise<() => void>
  trigger: (request: { kind: string; topic: string; payload: unknown }) => Promise<any>
  emit: (payload: any) => void
}

export async function executeAgentRun(input: AgentRunInput, deps: AgentDependencies): Promise<any> {
  const payload = buildAgentRequest(input)
  let requestId = payload.runId || ''
  const cleanup = await deps.observe((message) => {
    if (message?.topic !== 'brain.agent.run.event' || message.payload?.sessionId !== payload.sessionId) return
    const id = message.payload.requestId
    if (!id || (requestId && requestId !== id)) return
    requestId = id
    deps.emit(message.payload)
  })
  try {
    return unwrapAgentResponse(await deps.trigger({ kind: 'command', topic: 'brain.agent.run', payload }))
  } finally {
    cleanup()
  }
}
