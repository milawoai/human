// Development readiness gates only. Does not start or restart product services.
const { setTimeout: delay } = require('node:timers/promises');

async function post(url, timeoutMs) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
  });
  if (!response.ok) throw Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function waitReady(stage, {
  timeoutMs = 120000, intervalMs = 500, log = console.log, request = post,
  neuralUrl = 'http://127.0.0.1:12002', pythonUrl = 'http://127.0.0.1:12003',
} = {}) {
  if (!['neural', 'hearing'].includes(stage)) throw Error(`Unknown stage: ${stage}`);
  const deadline = Date.now() + timeoutMs;
  let lastError = '尚未检查';
  let lastLog = 0;
  const get = url => request(url, Math.max(1, Math.min(1500, deadline - Date.now())));
  log(`[dev-ready] 等待 ${stage} 的 HTTP、Actor 与能力注册，最多 ${timeoutMs / 1000}s`);
  do {
    try {
      const [actors, capabilities] = await Promise.all([
        get(`${neuralUrl}/neural/actors/list`), get(`${neuralUrl}/neural/capabilities/list`),
      ]);
      if (!actors.success || !Array.isArray(actors.data) || !capabilities.success || !Array.isArray(capabilities.data)) {
        throw Error('Neural 接口返回无效状态');
      }
      const requiredActors = ['brain-main', 'motor-tool-runner'];
      if (stage === 'hearing') requiredActors.push('sensory-hearing');
      for (const id of requiredActors) {
        if (!actors.data.some(a => a.actor?.actorId === id && a.connected === true)) throw Error(`Actor ${id} 尚未连接注册`);
      }
      const requiredCapabilities = [
        ['brain-main', 'brain.agent.run'], ['motor-tool-runner', 'motor.tool.list'],
      ];
      if (stage === 'hearing') requiredCapabilities.push(
        ['sensory-hearing', 'sensory.hearing.caption_stream.enable'],
        ['sensory-hearing', 'sensory.hearing.caption_stream.disable'],
      );
      for (const [actorId, topic] of requiredCapabilities) {
        if (!capabilities.data.some(c => c.actor?.actorId === actorId && c.topic === topic && c.online === true && c.enabled === true)) {
          throw Error(`能力 ${actorId}: ${topic} 尚未在线注册`);
        }
      }
      if (stage === 'hearing') {
        const health = await get(`${pythonUrl}/api/hello`);
        if (health.status !== 'success' || health.service !== 'Human Python Service') throw Error('Python HTTP 尚未就绪');
      }
      log(`[dev-ready] ${stage} 就绪`);
      return;
    } catch (error) {
      lastError = error.message;
      if (Date.now() - lastLog >= 5000) {
        log(`[dev-ready] ${lastError}`);
        lastLog = Date.now();
      }
    }
    await delay(Math.max(0, Math.min(intervalMs, deadline - Date.now())));
  } while (Date.now() < deadline);
  throw Error(`${stage} 等待超时：${lastError}。请检查后端/Python 调试终端与注册日志，再重新启动全栈调试。`);
}

module.exports = { waitReady };
if (require.main === module) waitReady(process.argv[2]).catch(error => {
  console.error(`[dev-ready] ${error.message}`);
  process.exitCode = 1;
});
