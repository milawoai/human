import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import Database from 'better-sqlite3';
import {
  ConversationRecord,
  ConversationSnapshot,
  ConversationStatus,
  ConversationType,
  CreateConversationInput,
} from './conversation.types';

export const CONVERSATION_INDEX_DB_PATH = Symbol('CONVERSATION_INDEX_DB_PATH');

interface ConversationRow {
  conversation_id: string;
  conversation_type: ConversationType;
  status: ConversationStatus;
  title: string | null;
  pi_session_path: string | null;
  created_at: number;
  updated_at: number;
  last_opened_at: number;
}

@Injectable()
export class ConversationIndexStore implements OnModuleDestroy {
  private readonly db: Database.Database;

  constructor(@Optional() @Inject(CONVERSATION_INDEX_DB_PATH) dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(os.homedir(), '.ai_secretary', 'sqlite', 'session.db');
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureSchema();
  }

  create(input: CreateConversationInput = {}): ConversationSnapshot {
    const conversationId = input.conversationId ?? randomUUID();
    const conversationType = input.conversationType ?? 'companion';
    const requestedAt = input.now ?? Date.now();
    const openedAt = this.nextOpenedAt(conversationType, requestedAt);
    this.db.prepare(`
      INSERT INTO conversation_index (
        conversation_id, conversation_type, status, title, pi_session_path,
        created_at, updated_at, last_opened_at
      ) VALUES (?, ?, 'pending', ?, NULL, ?, ?, ?)
    `).run(conversationId, conversationType, input.title ?? null, requestedAt, requestedAt, openedAt);
    return this.requireSnapshot(conversationId);
  }

  get(conversationId: string): ConversationSnapshot | null {
    const row = this.getRow(conversationId);
    return row ? this.toSnapshot(row) : null;
  }

  current(conversationType: ConversationType): ConversationSnapshot | null {
    const row = this.db.prepare(`
      SELECT * FROM conversation_index
      WHERE conversation_type = ?
      ORDER BY last_opened_at DESC, rowid DESC
      LIMIT 1
    `).get(conversationType) as ConversationRow | undefined;
    return row ? this.toSnapshot(row) : null;
  }

  touchOpened(conversationId: string, now = Date.now()): ConversationSnapshot {
    const row = this.requireRow(conversationId);
    const openedAt = this.nextOpenedAt(row.conversation_type, now);
    this.db.prepare(`
      UPDATE conversation_index SET last_opened_at = ?, updated_at = ?
      WHERE conversation_id = ?
    `).run(openedAt, now, conversationId);
    return this.requireSnapshot(conversationId);
  }

  markAvailable(conversationId: string, piSessionPath: string, now = Date.now()): ConversationSnapshot {
    this.requireRow(conversationId);
    this.db.prepare(`
      UPDATE conversation_index
      SET status = 'available', pi_session_path = ?, updated_at = ?
      WHERE conversation_id = ?
    `).run(piSessionPath, now, conversationId);
    return this.requireSnapshot(conversationId);
  }

  markUnavailable(conversationId: string, now = Date.now()): ConversationSnapshot {
    this.requireRow(conversationId);
    this.db.prepare(`
      UPDATE conversation_index SET status = 'unavailable', updated_at = ?
      WHERE conversation_id = ?
    `).run(now, conversationId);
    return this.requireSnapshot(conversationId);
  }

  getInternalRecord(conversationId: string): ConversationRecord | null {
    const row = this.getRow(conversationId);
    return row ? { ...this.toSnapshot(row), piSessionPath: row.pi_session_path ?? undefined } : null;
  }

  reconcileAvailableFiles(now = Date.now()): string[] {
    const rows = this.db.prepare(`
      SELECT * FROM conversation_index WHERE status = 'available'
    `).all() as ConversationRow[];
    const missing = rows.filter((row) => !row.pi_session_path || !fs.existsSync(row.pi_session_path));
    const update = this.db.prepare(`
      UPDATE conversation_index SET status = 'unavailable', updated_at = ?
      WHERE conversation_id = ?
    `);
    this.db.transaction(() => missing.forEach((row) => update.run(now, row.conversation_id)))();
    return missing.map((row) => row.conversation_id);
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  onModuleDestroy(): void {
    this.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_index (
        conversation_id TEXT PRIMARY KEY,
        conversation_type TEXT NOT NULL CHECK (conversation_type IN ('companion')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'available', 'unavailable')),
        title TEXT,
        pi_session_path TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_opened_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_index_current
        ON conversation_index (conversation_type, last_opened_at DESC);
    `);
  }

  private nextOpenedAt(conversationType: ConversationType, requestedAt: number): number {
    const row = this.db.prepare(`
      SELECT MAX(last_opened_at) AS value FROM conversation_index WHERE conversation_type = ?
    `).get(conversationType) as { value: number | null };
    return Math.max(requestedAt, (row.value ?? requestedAt - 1) + 1);
  }

  private getRow(conversationId: string): ConversationRow | undefined {
    return this.db.prepare('SELECT * FROM conversation_index WHERE conversation_id = ?')
      .get(conversationId) as ConversationRow | undefined;
  }

  private requireRow(conversationId: string): ConversationRow {
    const row = this.getRow(conversationId);
    if (!row) throw new Error(`Conversation not found: ${conversationId}`);
    return row;
  }

  private requireSnapshot(conversationId: string): ConversationSnapshot {
    return this.toSnapshot(this.requireRow(conversationId));
  }

  private toSnapshot(row: ConversationRow): ConversationSnapshot {
    return {
      conversationId: row.conversation_id,
      conversationType: row.conversation_type,
      status: row.status,
      title: row.title ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastOpenedAt: row.last_opened_at,
    };
  }
}
