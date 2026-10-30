import assert from 'node:assert/strict';
import { BrainAgentService } from '../src/brain/agent/brain-agent.service';
import { AgentRunRegistry } from '../src/brain/agent/agent-run-registry';

const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise<void>(r => setImmediate(r));
async function main() {
  const service = Object.create(BrainAgentService.prototype) as any;
  const gate = deferred();
  let resolves = 0, prompts = 0, aborts = 0;
  let initialization = deferred(); initialization.resolve();
  service.llmService = { resolveModel: async () => { resolves++; await initialization.promise; return { profileName: 'fixture', profile: {}, model: {} }; } };
  service.sessionStore = { loadSessionFile: () => null, upsertSession: () => ({}) };
  service.providerAuthService = { resolveApiKey: async () => undefined };
  service.publishEvent = () => {};
  service.getAgentCore = async () => ({ Agent: class {
    state = { messages: [], errorMessage: undefined };
    subscribe() { return () => {}; }
    async prompt() { prompts++; await gate.promise; }
    async continue() { await this.prompt(); }
    async waitForIdle() {}
    abort() { aborts++; }
  } });
  const call = (topic: string, payload: any, id: string = crypto.randomUUID()) => service.handleCommand({ id, topic, payload });
  const run = call('brain.agent.run', { sessionId: 'test-lock', userText: 'read only', toolPreset: 'none' }, 'run-1');
  await tick();
  const status = await call('brain.agent.run.get', { sessionId: 'test-lock' });
  assert.equal(status.success, true, status.msg);
  assert.equal(status.data.run.status, 'running');
  assert.equal(status.data.run.runId, 'run-1');
  const conflict = await call('brain.agent.run', { sessionId: 'test-lock', userText: 'duplicate', toolPreset: 'none' }, 'run-2');
  assert.equal(conflict.success, false);
  assert.equal(resolves, 1, 'reject before model initialization');
  assert.equal(prompts, 1);
  const cancel = await call('brain.agent.run.cancel', { sessionId: 'test-lock', runId: 'run-1' });
  assert.equal(cancel.data.run.status, 'cancelling');
  await call('brain.agent.run.cancel', { sessionId: 'test-lock', runId: 'run-1' });
  assert.equal(aborts, 1, 'cancel is idempotent');
  assert.equal((await call('brain.agent.run.get', { runId: 'run-1', sessionId: 'wrong' })).success, false);
  assert.equal((await call('brain.agent.run', { sessionId: 'test-lock', userText: 'still blocked', toolPreset: 'none' })).success, false);
  gate.resolve(); await run;
  assert.equal((await call('brain.agent.run.get', { runId: 'run-1' })).data.run.status, 'cancelled');
  assert.equal((await call('brain.agent.run.get', { runId: 'missing' })).data.run, null);
  assert.equal((await call('brain.agent.run.get', { runId: 'missing' })).data.status, 'unknown');
  assert.equal((await call('brain.agent.run', { sessionId: 'test-lock', userText: 'again', toolPreset: 'none' }, 'run-3')).success, true);
  assert.equal((await call('brain.agent.run.get', { runId: 'run-3' })).data.run.status, 'succeeded');
  initialization = deferred();
  const preparing = call('brain.agent.run', { sessionId: 'preparing', userText: 'test', toolPreset: 'none' }, 'run-4');
  await tick();
  await call('brain.agent.run.cancel', { runId: 'run-4' });
  const previousPrompts = prompts;
  initialization.resolve(); await preparing;
  assert.equal(prompts, previousPrompts, 'cancel during initialization must not prompt');
  assert.equal((await call('brain.agent.run.get', { runId: 'run-4' })).data.run.status, 'cancelled');
  service.llmService.resolveModel = async () => { throw Error('fixture initialization failure'); };
  assert.equal((await call('brain.agent.run', { sessionId: 'fail', userText: 'x' }, 'run-5')).success, false);
  assert.equal((await call('brain.agent.run.get', { runId: 'run-5' })).data.run.status, 'failed');
  assert.equal((await call('brain.agent.run', { sessionId: 'fail', userText: 'x' }, 'run-6')).success, false);
  assert.equal((await call('brain.agent.run.get', { runId: 'run-6' })).data.run.status, 'failed', 'failure releases lock');
  console.log('Agent run management: query, locking, cancelling, initialization cancellation, errors: PASS');
  const registry = new AgentRunRegistry(1);
  registry.begin('active', 'active-session');
  registry.begin('terminal-1', 's1'); registry.finish('terminal-1');
  registry.begin('terminal-2', 's2'); registry.finish('terminal-2');
  assert.equal(registry.get('terminal-1'), null);
  assert.equal(registry.get('active')?.status, 'running', 'eviction must not remove active locks');
  const snapshot = registry.get('terminal-2')!; snapshot.status = 'failed';
  assert.equal(registry.get('terminal-2')?.status, 'succeeded', 'queries return immutable copies');
  assert.throws(() => registry.begin('terminal-2', 'other'), /EXISTS/);
  console.log('Run retention and snapshot isolation: PASS');

  // Exercise cancellation through the actual installed Pi loop into a tool signal.
  const { createAssistantMessageEventStream } = await new Function('return import("@earendil-works/pi-ai")')();
  service.getAgentCore = BrainAgentService.prototype['getAgentCore'];
  const enteredTool = deferred();
  let signalAborted = false;
  let realTurns = 0;
  const model = { id: 'fixture', name: 'Fixture', provider: 'fixture', api: 'openai-completions', baseUrl: 'http://unused', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  service.llmService = {
    resolveModel: async () => ({ profileName: 'fixture', profile: {}, model }),
    streamSimple: () => {
      if (++realTurns > 2) throw new Error('Cancellation fixture unexpectedly requested another model turn');
      const stream = createAssistantMessageEventStream();
      const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [{ type: 'toolCall', id: 'safe', name: 'test.wait', arguments: {} }], stopReason: 'toolUse', timestamp: Date.now(), usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: 'toolUse', message });
      return stream;
    },
  };
  service.toolAdapterService = { getAllTools: () => [{ name: 'test.wait', label: 'Wait', description: 'In-memory cancellation fixture', parameters: { type: 'object', properties: {} },
    execute: async (_id: any, _args: any, signal: AbortSignal) => {
      enteredTool.resolve();
      await new Promise<void>(resolve => { if (signal.aborted) { signalAborted = true; resolve(); } else signal.addEventListener('abort', () => { signalAborted = true; resolve(); }, { once: true }); });
      return { content: [{ type: 'text', text: 'cancel acknowledged' }] };
    },
  }] };
  const realRun = call('brain.agent.run', { sessionId: 'real-cancel', userText: 'wait', toolPreset: 'default' }, 'real-run');
  await Promise.race([enteredTool.promise, realRun.then((result: any) => { throw new Error(`Pi finished before tool entry: ${JSON.stringify(result)}`); })]);
  await call('brain.agent.run.cancel', { runId: 'real-run' });
  await realRun;
  assert.equal(signalAborted, true);
  assert.equal((await call('brain.agent.run.get', { runId: 'real-run' })).data.run.status, 'cancelled');
  console.log('Real Pi Agent cancellation → tool AbortSignal → confirmed terminal: PASS');
}
void main();
