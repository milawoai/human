import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Api, Model } from '@earendil-works/pi-ai';
import { ConversationIndexStore } from '../conversation-index.store';
import { PiConversationFactory } from '../pi-conversation.factory';

const loadAi = (): Promise<typeof import('@earendil-works/pi-ai')> =>
  new Function('return import("@earendil-works/pi-ai")')();

function fixtureModel(id: string): Model<Api> {
  return {
    id, name: id, provider: 'human-fixture', api: 'openai-completions',
    baseUrl: 'http://unused', reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 8192, maxTokens: 1024,
  } as Model<Api>;
}

export async function runPiConversationFactoryCases(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'human-pi-factory-'));
  const store = new ConversationIndexStore(path.join(root, 'session.db'));
  const conversation = store.create({ conversationId: '11111111-1111-4111-8111-111111111111' });
  const contexts: unknown[] = [];
  const ai = await loadAi();
  const streamSimple = (model: Model<Api>, context: unknown) => {
    contexts.push(structuredClone(context));
    const stream = ai.createAssistantMessageEventStream();
    const message = {
      role: 'assistant', api: model.api, provider: model.provider, model: model.id,
      content: [{ type: 'text', text: '可见回答。<human_speech_summary>{"text":"简短播报。"}</human_speech_summary>' }],
      stopReason: 'stop', timestamp: Date.now(),
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    } as any;
    stream.push({ type: 'start', partial: message });
    stream.push({ type: 'done', reason: 'stop', message });
    return stream;
  };
  const llm = {
    resolveModel: async (profileName?: string) => ({
      profileName: profileName ?? 'current',
      profile: { provider: 'human-fixture', model: profileName ?? 'current' },
      model: fixtureModel(profileName ?? 'current'),
    }),
    getModels: async () => ({ streamSimple }),
  };
  const auth = { resolveApiKey: async () => 'fixture-key' };
  let speechSummary = '';

  try {
    const factory = new PiConversationFactory(store, llm as any, auth as any, { root });
    const opened = await factory.open({
      conversationId: conversation.conversationId,
      profileName: 'old-model',
      turnContext: { memoryText: 'REQUEST_ONLY_MEMORY', onSpeechSummary: value => { speechSummary = value ?? ''; } },
    });
    assert.strictEqual(opened.profileKey, 'old-model');
    assert.strictEqual(opened.session.sessionManager.getSessionId(), conversation.conversationId);
    assert.deepStrictEqual(opened.session.getActiveToolNames(), []);
    await opened.session.prompt('你好');
    assert.ok(JSON.stringify(contexts[0]).includes('REQUEST_ONLY_MEMORY'));
    assert.strictEqual(speechSummary, '简短播报。');
    assert.strictEqual(JSON.stringify(opened.session.state.messages).includes('human_speech_summary'), false);
    const sessionFile = opened.session.sessionManager.getSessionFile();
    assert.ok(sessionFile && sessionFile.startsWith(root));
    store.markAvailable(conversation.conversationId, sessionFile);
    opened.dispose();

    const restored = await factory.open({ conversationId: conversation.conversationId, profileName: 'new-model' });
    assert.strictEqual(restored.session.model?.id, 'new-model');
    assert.strictEqual(restored.profileKey, 'new-model');
    restored.dispose();
    console.log('PASS: isolated Pi factory, inline context cleanup and current-model restore');
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
