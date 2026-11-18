import type { BackendName } from '../../../shared/backendLifecycle'
import type { ProbeResult } from './ports'
interface Endpoints { node: { host: string; port: number }; python: { host: string; port: number } }
export interface RuntimeIdentity {
  protocolVersion: number; serviceType: string; serviceVersion: string;
  deploymentId: string; instanceId: string; neuralInstanceId?: string
}
export type JsonRequest = (url: string, signal: AbortSignal, body?: unknown) => Promise<any>
export const requestJson: JsonRequest = async (url, signal, body) => {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]), redirect: 'error' })
  if (!response.ok) throw Error(`Runtime HTTP ${response.status}`)
  return response.json()
}
export class ServiceProbe {
  private readonly endpoints: Endpoints
  private readonly deploymentId: string
  private readonly request: JsonRequest
  constructor(endpoints: Endpoints, deploymentId: string, request: JsonRequest = requestJson) {
    this.endpoints = endpoints; this.deploymentId = deploymentId; this.request = request
  }
  url(name: BackendName): string {
    return `http://${this.endpoints[name].host}:${this.endpoints[name].port}`
  }
  async identity(name: BackendName, signal: AbortSignal): Promise<RuntimeIdentity> {
    return this.request(`${this.url(name)}/runtime/identity`, signal)
  }
  private compatible(name: BackendName, value: RuntimeIdentity): boolean {
    return !!value && value.protocolVersion === 1 && value.serviceType === name && value.serviceVersion === '1.0.0' &&
      value.deploymentId === this.deploymentId && typeof value.instanceId === 'string' && !!value.instanceId &&
      (name !== 'node' || typeof value.neuralInstanceId === 'string' && !!value.neuralInstanceId)
  }
  async probe(name: BackendName, signal: AbortSignal): Promise<ProbeResult> {
    try {
      const value = await this.identity(name, signal)
      if (!this.compatible(name, value)) return { kind: 'incompatible', reason: `${name}: incompatible runtime identity` }
      return { kind: 'compatible', instanceId: value.instanceId }
    } catch (error) {
      signal.throwIfAborted()
      // Only refused local TCP connection is absence. Timeouts/HTTP failures
      // may be another server, never permission to kill or blindly spawn.
      return (error as any)?.cause?.code === 'ECONNREFUSED'
        ? { kind: 'absent' } : { kind: 'unknown', reason: `${name}: listener is unknown or unresponsive` }
    }
  }
  async ready(name: BackendName, expectedInstance: string, signal: AbortSignal): Promise<boolean> {
    const identity = await this.identity(name, signal)
    if (!this.compatible(name, identity) || identity.instanceId !== expectedInstance) return false
    const node = name === 'node' ? identity : await this.identity('node', signal)
    if (!this.compatible('node', node)) return false
    const [actors, capabilities] = await Promise.all([
      this.request(`${this.url('node')}/neural/actors/list`, signal, {}),
      this.request(`${this.url('node')}/neural/capabilities/list`, signal, {})
    ])
    if (!actors.success || !Array.isArray(actors.data) || !capabilities.success || !Array.isArray(capabilities.data)) return false
    const required = name === 'node'
      ? [['brain-main', 'brain.agent.run'], ['motor-tool-runner', 'motor.tool.list']]
      : [['sensory-hearing', 'sensory.hearing.caption_stream.enable'], ['sensory-hearing', 'sensory.hearing.caption_stream.disable']]
    return required.every(([actorId, topic]) => {
      const actor = actors.data.find((a: any) => a.actor?.actorId === actorId && a.connected === true &&
        a.neuralInstanceId === node.neuralInstanceId && a.serviceInstanceId === (name === 'node' ? node.neuralInstanceId : expectedInstance))
      return actor && capabilities.data.some((c: any) => c.actor?.actorId === actorId && c.topic === topic && c.enabled === true && c.online === true &&
        c.neuralInstanceId === actor.neuralInstanceId && c.serviceInstanceId === actor.serviceInstanceId && c.connectionId === actor.connectionId)
    })
  }
}
