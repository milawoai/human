import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:net'
import { NeuralWSClient } from '../../apps/body/src/main/services/neural/impl/neural-ws-client'
import { setNeuralTarget } from '../../apps/body/src/main/services/neural/impl/targets'

test('Body initial connection error resolves instead of leaving startup pending', async () => {
  const server = createServer(socket => socket.destroy())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  assert(![12002, 12003].includes(port))
  setNeuralTarget(`http://127.0.0.1:${port}/neural`)
  const client = new NeuralWSClient()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([client.connect(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Error('Body connection promise remained pending')), 1500)
    })])
    assert.equal(result.success, false)
  } finally {
    clearTimeout(timer)
    await client.disconnect()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
