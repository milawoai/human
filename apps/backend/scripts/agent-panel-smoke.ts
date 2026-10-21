import assert from 'node:assert/strict';
import { BrainAgentService } from '../src/brain/agent/brain-agent.service';

async function main() {
  const service = Object.create(BrainAgentService.prototype) as any;
  let calls = 0;
  service.toolAdapterService = { getAllTools: () => { calls++; return [{ name: 'test.echo' }, { name: 'pi-coding-tools.read' }]; } };
  assert.equal(service.resolveToolPreset(undefined, 'none', undefined), 'none');
  assert.deepEqual(await service.buildTools({ toolPreset: 'none' }), []);
  assert.equal(calls, 0, 'no-tools mode must not even construct tool adapters');
  assert.equal((await service.buildTools({ toolPreset: 'default' })).length, 2);
  assert.equal((await service.buildTools({ toolPreset: 'coding_only' })).length, 1);
  console.log('Agent panel tool presets: PASS');

  // Real installed Pi Agent loop, deterministic model stream, harmless in-memory tool.
  const { createAssistantMessageEventStream } = await new Function('return import("@earendil-works/pi-ai")')();
  const events: any[] = [];
  let modelTurns = 0;
  let toolRuns = 0;
  let persisted: any;
  service.publishEvent = (_topic: string, payload: any) => events.push(payload);
  service.providerAuthService = { resolveApiKey: async () => undefined };
  service.sessionStore = {
    loadSessionFile: () => null,
    upsertSession: (input: any) => { persisted = input; return { sessionId: input.sessionId }; },
  };
  const model = { id: 'fixture', name: 'Fixture', provider: 'fixture', api: 'openai-completions', baseUrl: 'http://unused', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  service.llmService = {
    resolveModel: async () => ({ profileName: 'fixture', profile: {}, model }),
    streamSimple: (_model: any, context: any) => {
      modelTurns++;
      const stream = createAssistantMessageEventStream();
      const withTool = context.messages.some((m: any) => m.toolsAdded?.length) && !context.messages.some((m: any) => m.role === 'toolResult');
      const message = {
        role: 'assistant', api: model.api, provider: model.provider, model: model.id,
        content: withTool ? [{ type: 'toolCall', id: 'safe-call', name: 'test.echo', arguments: {} }] : [{ type: 'text', text: 'fixture finished' }],
        stopReason: withTool ? 'toolUse' : 'stop', timestamp: Date.now(),
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: message.stopReason, message });
      return stream;
    },
  };
  service.toolAdapterService.getAllTools = () => [{
    name: 'test.echo', label: 'Echo', description: 'Harmless test',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async () => { toolRuns++; return { content: [{ type: 'text', text: 'safe result' }] }; },
  }];
  const run = await service.handleCommand({ id: 'fixture-run', topic: 'brain.agent.run', payload: { sessionId: 'fixture-session', userText: 'test', toolPreset: 'default' } });
  assert.equal(run.success, true, run.msg);
  assert.equal(toolRuns, 1);
  assert.equal(modelTurns, 2);
  assert.ok(events.some(p => p.event.type === 'tool_execution_start'));
  assert.ok(events.some(p => p.event.type === 'tool_execution_end'));
  assert.ok(events.some(p => p.event.type === 'agent_end'));
  assert.ok(persisted.messages.some((m: any) => m.role === 'toolResult'));
  assert.ok(events.every(p => p.sessionId === 'fixture-session' && p.requestId === 'fixture-run'));
  console.log('Real Pi Agent: model → tool → model, events and persistence: PASS');
  const noTools = await service.handleCommand({ id: 'fixture-no-tools', topic: 'brain.agent.run', payload: { sessionId: 'fixture-no-tools', userText: 'test', toolPreset: 'none' } });
  assert.equal(noTools.success, true, noTools.msg);
  assert.equal(modelTurns, 3);
  assert.equal(toolRuns, 1, 'no-tools run must not execute any tools');
  console.log('Real Pi Agent no-tools run: PASS');
}
void main();
