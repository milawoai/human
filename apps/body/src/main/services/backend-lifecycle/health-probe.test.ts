import assert from 'node:assert/strict'
import test from 'node:test'
// @ts-expect-error Node strip-types needs a .ts extension.
import { ServiceProbe } from './health-probe.ts'
const identity = { protocolVersion: 1, serviceVersion: '1.0.0', deploymentId: 'fixture', serviceType: 'python', instanceId: 'py-1' }

test('hearing readiness rejects another instance and an old Neural generation', async () => {
  const config = { node: { host: '127.0.0.1', port: 19002 }, python: { host: '127.0.0.1', port: 19003 } }
  let registered = 'other', neural = 'n1'
  const request = async (url: string) => {
    if (url.endsWith('/runtime/identity')) return url.includes('19002') ? { ...identity, serviceType: 'node', instanceId: 'n1', neuralInstanceId: 'n1' } : identity
    if (url.endsWith('/actors/list')) return { success: true, data: [{ actor: { actorId: 'sensory-hearing' }, connected: true, serviceInstanceId: registered, neuralInstanceId: neural, connectionId: 'c1' }] }
    return { success: true, data: ['enable', 'disable'].map(name => ({ actor: { actorId: 'sensory-hearing' }, topic: `sensory.hearing.caption_stream.${name}`, online: true, enabled: true, serviceInstanceId: registered, neuralInstanceId: neural, connectionId: 'c1' })) }
  }
  const probe = new ServiceProbe(config, 'fixture', request)
  assert.equal(await probe.ready('python', 'py-1', new AbortController().signal), false)
  registered = 'py-1'; neural = 'old'
  assert.equal(await probe.ready('python', 'py-1', new AbortController().signal), false)
  neural = 'n1'
  assert.equal(await probe.ready('python', 'py-1', new AbortController().signal), true)
})
