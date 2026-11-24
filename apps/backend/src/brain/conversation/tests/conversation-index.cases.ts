import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { ConversationIndexStore } from '../conversation-index.store';

export async function runConversationIndexCases(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'human-conversation-index-'));
  const dbPath = path.join(root, 'session.db');
  try {
    const store = new ConversationIndexStore(dbPath);
    const first = store.create({ now: 100 });
    assert.match(first.conversationId, /^[0-9a-f-]{36}$/);
    assert.strictEqual(first.status, 'pending');
    assert.strictEqual(store.current('companion')?.conversationId, first.conversationId);

    const second = store.create({ now: 100 });
    assert.strictEqual(store.current('companion')?.conversationId, second.conversationId);
    store.touchOpened(first.conversationId, 200);
    assert.strictEqual(store.current('companion')?.conversationId, first.conversationId);

    const sessionFile = path.join(root, 'pi-session.jsonl');
    fs.writeFileSync(sessionFile, '{"type":"session"}\n');
    store.markAvailable(first.conversationId, sessionFile, 210);
    assert.strictEqual(store.get(first.conversationId)?.status, 'available');
    store.close();

    const reopened = new ConversationIndexStore(dbPath);
    assert.strictEqual(reopened.current('companion')?.conversationId, first.conversationId);
    fs.rmSync(sessionFile);
    assert.deepStrictEqual(reopened.reconcileAvailableFiles(), [first.conversationId]);
    assert.strictEqual(reopened.get(first.conversationId)?.status, 'unavailable');

    const columns = new Database(dbPath, { readonly: true })
      .prepare('PRAGMA table_info(conversation_index)')
      .all() as Array<{ name: string }>;
    assert.ok(!columns.some(({ name }) => /message|prompt|transcript|body/i.test(name)));
    reopened.close();
    console.log('PASS: conversation product index persistence, recovery and metadata-only storage');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
