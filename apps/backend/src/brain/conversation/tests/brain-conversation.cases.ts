import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConversationIndexStore } from '../conversation-index.store';
import { BrainConversationService } from '../brain-conversation.service';

const loadPi = (): Promise<typeof import('@earendil-works/pi-coding-agent')> =>
  new Function('return import("@earendil-works/pi-coding-agent")')();

function message(topic: string, kind: 'command' | 'query', payload: unknown = {}) {
  return { id: crypto.randomUUID(), topic, kind, payload, timestamp: Date.now(), source: {
    actorId: 'test', runtime: 'nest' as const, system: 'brain' as const, module: 'test',
  } };
}

export async function runBrainConversationCases(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'human-conversation-handler-'));
  const store = new ConversationIndexStore(path.join(root, 'session.db'));
  const capabilities: any[] = [];
  const handlers: any[] = [];
  const service = new BrainConversationService(
    { registerInternalActor() {}, registerCapabilities(value: any[]) { capabilities.push(...value); } } as any,
    { registerCommandHandler(value: any) { handlers.push(value); } } as any,
    store,
  );
  try {
    service.onModuleInit();
    assert.strictEqual(capabilities.length, 3);
    assert.strictEqual(handlers[0], service);

    const created = await service.handleCommand(message('brain.conversation.create', 'command'));
    assert.strictEqual(created.success, true);
    const conversationId = created.data.conversation.conversationId as string;
    const current = await service.handleCommand(message('brain.conversation.current.get', 'query'));
    assert.strictEqual(current.data.conversation.conversationId, conversationId);
    const wrongKind = await service.handleCommand(message('brain.conversation.create', 'query'));
    assert.strictEqual(wrongKind.success, false);

    const pi = await loadPi();
    const cwd = path.join(root, 'cwd');
    const sessionDir = path.join(root, 'sessions');
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(sessionDir, { recursive: true });
    const manager = pi.SessionManager.create(cwd, sessionDir, { id: conversationId });
    manager.appendMessage({ role: 'user', content: '你好', timestamp: 1 } as any);
    manager.appendMessage({ role: 'assistant', content: [], stopReason: 'error', timestamp: 1.5 } as any);
    manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: '你好呀' }], timestamp: 2 } as any);
    store.markAvailable(conversationId, manager.getSessionFile()!);

    const transcript = await service.handleCommand(message(
      'brain.conversation.transcript.get', 'query', { conversationId },
    ));
    assert.deepStrictEqual(
      transcript.data.messages.map((item: any) => [item.role, item.content]),
      [['user', '你好'], ['assistant', '你好呀']],
    );
    assert.strictEqual(JSON.stringify(transcript.data).includes('piSessionPath'), false);

    store.markUnavailable(conversationId);
    const unavailable = await service.handleCommand(message(
      'brain.conversation.transcript.get', 'query', { conversationId },
    ));
    assert.strictEqual(unavailable.success, false);
    assert.strictEqual(unavailable.code, 'CONVERSATION_UNAVAILABLE');
    const missing = await service.handleCommand(message(
      'brain.conversation.transcript.get', 'query', { conversationId: crypto.randomUUID() },
    ));
    assert.strictEqual(missing.success, false);
    assert.strictEqual(missing.code, 'CONVERSATION_NOT_FOUND');
    console.log('PASS: conversation capabilities, validation, current and current-branch transcript');
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
