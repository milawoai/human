import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { io, Socket } from 'socket.io-client';
import { NeuralHttpModule } from '../neural-http/neural-http.module';

/** Only starts a fixture Neural module, bound to ephemeral loopback port. */
export async function verifyInstanceHttp() {
  const app = await NestFactory.create(NeuralHttpModule, { logger: false });
  const clients: Socket[] = [];
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    const base = `http://127.0.0.1:${address.port}`;
    assert(![12002, 12003].includes(address.port));
    const client = io(`${base}/neural`, { transports: ['websocket'], reconnection: false, autoConnect: false });
    clients.push(client);
    const registered = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('fixture register timeout')), 3000);
      client.on('connect', () => client.emit('register', { protocolVersion: 1, serviceInstanceId: 'http-fixture',
        actor: { actorId: 'http-fixture', runtime: 'python', system: 'sensory' } }));
      client.on('registered', () => { clearTimeout(timer); resolve(); });
      client.on('connect_error', error => { clearTimeout(timer); reject(error); });
    });
    client.connect();
    await registered;
    const post = async (instance: string) => {
      const response = await fetch(`${base}/neural/actors/list`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serviceInstanceId: instance }),
        signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 201); // Existing Nest POST endpoints use default 201.
      return response.json() as Promise<any>;
    };
    assert.equal((await post('http-fixture')).data.length, 1);
    assert.equal((await post('stale')).data.length, 0);
    console.log(`PASS: real isolated WS registration and HTTP filtering on ephemeral port ${address.port}`);
  } finally {
    for (const client of clients) client.disconnect();
    await app.close();
  }
}
