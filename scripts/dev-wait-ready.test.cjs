const test = require('node:test');
const assert = require('node:assert/strict');
const { waitReady } = require('./dev-wait-ready.cjs');

const actors = ['brain-main', 'motor-tool-runner', 'sensory-hearing'].map(actorId => ({ actor: { actorId }, connected: true }));
const caps = [
  { topic: 'brain.agent.run', actor: { actorId: 'brain-main' }, online: true, enabled: true },
  { topic: 'motor.tool.list', actor: { actorId: 'motor-tool-runner' }, online: true, enabled: true },
  { topic: 'sensory.hearing.caption_stream.enable', actor: { actorId: 'sensory-hearing' }, online: true, enabled: true },
  { topic: 'sensory.hearing.caption_stream.disable', actor: { actorId: 'sensory-hearing' }, online: true, enabled: true },
];
test('HTTP alone cannot make Neural ready without internal actor registration', async () => {
  await assert.rejects(waitReady('neural', { timeoutMs: 30, intervalMs: 1, log: () => {}, request: async () => ({ success: true, data: [] }) }), /brain-main/);
});
test('hearing waits for Python HTTP AND connected actor AND enabled online capabilities', async () => {
  let calls = 0;
  await waitReady('hearing', { timeoutMs: 1000, intervalMs: 1, log: () => {}, request: async url => {
    calls++;
    if (url.endsWith('/api/hello')) return { status: 'success', service: 'Human Python Service' };
    if (url.endsWith('/actors/list')) return { success: true, data: calls < 5 ? actors.filter(a => a.actor.actorId !== 'sensory-hearing') : actors };
    return { success: true, data: caps };
  } });
  assert.ok(calls > 3);
  await assert.rejects(waitReady('hearing', { timeoutMs: 30, intervalMs: 1, log: () => {}, request: async url => {
    if (url.endsWith('/api/hello')) return { status: 'success', service: 'Human Python Service' };
    return { success: true, data: url.endsWith('/actors/list') ? actors : caps.map(c => ({ ...c, online: false })) };
  } }), /能力/);
});
test('connection failures are retried and timeout is actionable', async () => {
  await assert.rejects(waitReady('neural', { timeoutMs: 30, intervalMs: 1, log: () => {}, request: async () => { throw Error('connection refused'); } }), /connection refused/);
});

test('real HTTP gate succeeds only after registration appears', { timeout: 10000 }, async () => {
  const http = require('node:http');
  let registered = false;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/hello') return res.end(JSON.stringify({ status: 'success', service: 'Human Python Service' }));
    res.end(JSON.stringify({ success: true, data: req.url.endsWith('/actors/list') ? (registered ? actors : actors.filter(a=>a.actor.actorId!=='sensory-hearing')) : caps }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const timer = setTimeout(() => { registered = true; }, 100);
  try {
    await waitReady('neural', { neuralUrl: url, timeoutMs: 2000, log: () => {} });
    await waitReady('hearing', { neuralUrl: url, pythonUrl: url, timeoutMs: 2000, intervalMs: 10, log: () => {} });
    assert.equal(registered, true);
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
