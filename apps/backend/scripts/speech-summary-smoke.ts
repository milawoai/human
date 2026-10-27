import assert from 'node:assert/strict';
import { speechSystemPrompt, splitSpeechSummary, visibleSpeechAnswer } from '../src/brain/speech/speech-summary';
import { BrainSpeechService } from '../src/brain/speech/brain-speech.service';
import { BrainCortexService } from '../src/brain/cortex/brain-cortex.service';
import { BrainAgentService } from '../src/brain/agent/brain-agent.service';
import { AgentSessionStore } from '../src/brain/agent/agent-session.store';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const block = (text: string) => `<human_speech_summary>${JSON.stringify({ text })}</human_speech_summary>`;

async function main() {
  assert.equal(speechSystemPrompt('base', false), 'base');
  assert.match(speechSystemPrompt('base', true), /80/);
  assert.deepEqual(splitSpeechSummary(`完整正文\n${block('已完成语音接入。')}`, true), { answer: '完整正文', summary: '已完成语音接入。' });
  assert.deepEqual(splitSpeechSummary('只有正文', true), { answer: '只有正文' });
  assert.equal(splitSpeechSummary(block('本次完成。'), true).summary, undefined, 'no narration without an actual answer');
  assert.equal(splitSpeechSummary(block('a'.repeat(81)), true).summary, undefined);
  for (const text of ['', '`npm run`', '/Users/test/a', 'https://example.com', '<think>秘密</think>']) {
    assert.equal(splitSpeechSummary(`正文${block(text)}`, true).summary, undefined, text);
  }
  for (const tail of [block('一') + block('二'), '<human_speech_summary>{bad', block('一') + '尾随正文']) {
    assert.equal(splitSpeechSummary(`正文${tail}`, true).summary, undefined);
    assert.equal(splitSpeechSummary(`正文${tail}`, true).answer, '正文');
  }
  const raw = `正文\n${block('已完成。')}`;
  for (let i = 0; i <= raw.length; i++) {
    const visible = visibleSpeechAnswer(raw.slice(0, i));
    assert.ok(!visible.includes('<'), visible);
    assert.ok(!visible.includes('text'), visible);
  }
  assert.equal(splitSpeechSummary(raw, false).answer, raw, 'disabled mode is unchanged');

  let calls: any[] = [];
  let selected = 'engine-a';
  let failure = false;
  const motor: any = { handleCommand: async (message: any) => {
    calls.push(message);
    if (message.topic === 'motor.tool.list') return { success: true, data: { tools: [{ id: selected, status: 'ready', capabilities: ['tts.synthesize'] }] } };
    return failure ? { success: false, data: { error: { message: 'engine unavailable' } } } : { success: true, data: { success: true, data: { audioUrl: 'http://localhost:12002/a.wav', durationMs: 100, format: 'wav' } } };
  } };
  const speech = new BrainSpeechService(motor);
  assert.equal(await speech.synthesize(undefined, 'session'), undefined);
  assert.equal(calls.length, 0);
  assert.equal((await speech.synthesize('已完成。', 'session'))?.status, 'ready');
  assert.deepEqual(calls[0].payload, { category: 'tts', detailed: true });
  assert.equal(calls[1].payload.tool, 'engine-a');
  selected = 'engine-b'; calls = [];
  await speech.synthesize('切换完成。', 'session');
  assert.equal(calls[1].payload.tool, 'engine-b', 'replacement requires no upper-level change');
  failure = true;
  assert.equal((await speech.synthesize('完成。', 'session'))?.status, 'failed');
  motor.handleCommand = async () => { throw new Error('offline'); };
  assert.equal((await speech.synthesize('完成。', 'session'))?.status, 'failed');
  motor.handleCommand = async () => ({ success: true, data: { tools: [] } });
  assert.equal((await speech.synthesize('完成。', 'session'))?.status, 'failed');
  console.log('Speech summary protocol and plugin orchestration: PASS');

  const cortex = Object.create(BrainCortexService.prototype) as any;
  let prompt = '';
  let synthesisCalls = 0;
  let stopReason = 'stop';
  const events: any[] = [];
  cortex.publishEvent = (topic: string, payload: any) => events.push({ topic, payload });
  cortex.attachMemoryContext = async (context: any) => context;
  cortex.speechService = { synthesize: async (summary: string) => { if (summary) synthesisCalls++; return summary ? { status: 'ready', summary, audioUrl: 'http://localhost/a.wav' } : undefined; } };
  cortex.llmService = { stream: async (input: any) => {
    prompt = input.context.systemPrompt || '';
    const text = prompt.includes('human_speech_summary') ? `这是完整答案。\n${block('回答了问题。')}` : '这是完整答案。';
    return { async *[Symbol.asyncIterator]() {
      yield { type: 'thinking_delta', delta: '内部推理不应出现在正文' };
      yield { type: 'thinking_end', content: '内部推理不应出现在正文' };
      for (const char of text) yield { type: 'text_delta', delta: char };
      yield { type: 'text_end', content: text };
    }, result: async () => ({ content: [{ type: 'text', text }], stopReason, ...(stopReason === 'error' ? { errorMessage: 'provider offline' } : {}) }) };
  } };
  const off = await cortex.handleCommand({ id: 'off', topic: 'brain.cortex.ask.requested', payload: { text: '你好' } });
  assert.equal(off.success, true, off.msg);
  assert.equal(prompt, '');
  assert.equal(synthesisCalls, 0);
  assert.equal(off.data.answer, '这是完整答案。', 'native thinking and text_end snapshots must not be appended to text');
  assert.equal(off.data.think, '内部推理不应出现在正文');
  const on = await cortex.handleCommand({ id: 'on', topic: 'brain.cortex.ask.requested', payload: { text: '你好', speechSummaryEnabled: true, sessionId: 'chat-a' } });
  assert.equal(on.success, true, on.msg);
  assert.match(prompt, /human_speech_summary/);
  assert.equal(on.data.answer, '这是完整答案。');
  assert.equal(on.data.speech.summary, '回答了问题。');
  assert.equal(synthesisCalls, 1);
  for (const terminal of ['error', 'aborted', 'length']) {
    stopReason = terminal;
    const failed = await cortex.handleCommand({ id: terminal, topic: 'brain.cortex.ask.requested', payload: { text: '你好', speechSummaryEnabled: true } });
    assert.equal(failed.data?.speech, undefined, `${terminal} must not narrate a partial/failed result`);
  }
  assert.equal(synthesisCalls, 1);
  assert.ok(!events.filter(e => e.topic.endsWith('.chunk')).map(e => e.payload.content).join('').includes('<human'));
  console.log('Cortex default off, single generation, stream isolation and summary: PASS');

  const { createAssistantMessageEventStream } = await new Function('return import("@earendil-works/pi-ai")')();
  const agent = Object.create(BrainAgentService.prototype) as any;
  let persisted: any = null;
  agent.sessionStore = { loadSessionFile: () => persisted, upsertSession: (input: any) => { persisted = input; return input; } };
  agent.toolAdapterService = { getAllTools: () => [] };
  agent.providerAuthService = { resolveApiKey: async () => undefined };
  agent.publishEvent = () => {};
  agent.speechService = cortex.speechService;
  const model = { id: 'fixture', name: 'fixture', provider: 'fixture', api: 'openai-completions', baseUrl: 'http://unused', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  agent.llmService = {
    resolveModel: async () => ({ profileName: 'fixture', profile: {}, model }),
    streamSimple: (_model: any, context: any) => {
      prompt = context.systemPrompt || context.messages.filter((m: any) => m.role === 'system').map((m: any) => [typeof m.content === 'string' ? m.content : m.content?.map((b: any) => b.text ?? '').join(''), ...Object.values(m.sections ?? {})].join('\n')).join('\n');
      const stream = createAssistantMessageEventStream();
      const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [{ type: 'text', text: prompt.includes('human_speech_summary') ? `已执行完成。${block('本次已完成。')}` : '已执行完成。' }], stopReason: 'stop', timestamp: Date.now(), usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: 'stop', message });
      return stream;
    },
  };
  const run = (payload: any) => agent.handleCommand({ id: crypto.randomUUID(), topic: 'brain.agent.run', payload: { sessionId: 'agent-a', userText: '完成任务', toolPreset: 'none', ...payload } });
  const a = await run({ speechSummaryEnabled: true });
  assert.equal(a.success, true, a.msg);
  assert.equal(a.data.speech.summary, '本次已完成。');
  assert.equal(persisted.speechSummaryEnabled, true);
  assert.ok(!persisted.systemPrompt.includes('human_speech_summary'), 'base prompt must not accumulate instructions');
  assert.ok(!JSON.stringify(persisted.messages).includes('human_speech_summary'));
  assert.equal((await run({})).data.speech.summary, '本次已完成。', 'restored preference applies');
  const silent = await run({ speechSummaryEnabled: false });
  assert.equal(silent.data.speech, undefined);
  assert.ok(!prompt.includes('human_speech_summary'));
  assert.equal(persisted.speechSummaryEnabled, false);
  console.log('Real Pi Agent session persistence and transient prompt: PASS');

  const directory = mkdtempSync(join(tmpdir(), 'human-speech-store-'));
  const store = Object.create(AgentSessionStore.prototype) as any;
  store.sessionDir = directory;
  store.db = new Database(':memory:');
  store.ensureSchema();
  try {
    const input = { sessionId: 'isolated', profileName: 'fixture', systemPrompt: 'base', messages: [] };
    store.upsertSession(input);
    assert.equal(store.getSession('isolated', { includeMessages: true }).speechSummaryEnabled, false);
    store.upsertSession({ ...input, speechSummaryEnabled: true });
    assert.equal(store.loadSessionFile('isolated').speechSummaryEnabled, true);
    assert.equal(store.getSession('isolated', { includeMessages: true }).speechSummaryEnabled, true);
    store.upsertSession({ ...input, speechSummaryEnabled: false });
    assert.equal(store.getSession('isolated', { includeMessages: true }).speechSummaryEnabled, false);
  } finally { store.db.close(); rmSync(directory, { recursive: true, force: true }); }
  console.log('Real session file persistence, backward-compatible default and explicit off: PASS');
}
void main();
