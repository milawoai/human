import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { readOwnerBootstrap } from '../owner-channel';
import { RuntimeService } from '../runtime.service';

export async function verifyOwnerChannel() {
  const input = new PassThrough();
  let lost = 0;
  const ready = readOwnerBootstrap(input, () => { lost++; }, 100);
  input.write(JSON.stringify({ type: 'bootstrap', protocolVersion: 1,
    ownerInstanceId: 'owner', expectedServiceInstanceId: 'child', ownerToken: 'x'.repeat(64),
    neuralUrl: 'http://127.0.0.1:19002/neural' }) + '\n');
  assert.equal((await ready).expectedServiceInstanceId, 'child');
  input.end();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(lost, 1);
  const invalid = new PassThrough();
  const bad = readOwnerBootstrap(invalid, () => {}, 100);
  invalid.end('{"bad":true}\n');
  await assert.rejects(bad);
  const timeout = new PassThrough();
  await assert.rejects(readOwnerBootstrap(timeout, () => {}, 10), /timeout/);
  const runtime = new RuntimeService();
  let closes = 0;
  runtime.configure({ ownerToken: 's'.repeat(64), expectedServiceInstanceId: 'runtime-test' });
  runtime.setShutdown(async () => { closes++; });
  assert.equal(runtime.authorize('wrong'), false);
  assert.equal(runtime.authorize('s'.repeat(64)), true);
  await Promise.all([runtime.shutdown(), runtime.shutdown()]);
  assert.equal(closes, 1);
  assert(!JSON.stringify(runtime.identity()).includes('s'.repeat(64)));
  console.log('PASS: stdin handshake, EOF, invalid/timeout, token and idempotent shutdown');
}
