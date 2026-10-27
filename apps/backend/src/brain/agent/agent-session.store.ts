import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';

interface AgentSessionMetaRow {
  session_id: string;
  profile_name: string;
  status: string;
  message_count: number;
  created_at: number;
  updated_at: number;
  file_path: string;
  last_user_text: string | null;
  last_assistant_text: string | null;
  last_error: string | null;
}

interface PersistedSessionFile {
  version: 1;
  sessionId: string;
  profileName: string;
  systemPrompt: string;
  speechSummaryEnabled?: boolean;
  messages: unknown[];
  createdAt: number;
  updatedAt: number;
  lastRun?: {
    requestId?: string;
    eventCount: number;
    lastError?: string;
    finishedAt: number;
  };
}

interface UpsertSessionInput {
  sessionId: string;
  profileName: string;
  systemPrompt: string;
  speechSummaryEnabled?: boolean;
  messages: unknown[];
  requestId?: string;
  eventCount?: number;
  lastError?: string;
}

@Injectable()
export class AgentSessionStore {
  private readonly secretDir = path.join(os.homedir(), '.ai_secretary');
  private readonly sqliteDir = path.join(this.secretDir, 'sqlite');
  private readonly sessionDir = path.join(this.secretDir, 'agent_session');
  private readonly dbPath = path.join(this.sqliteDir, 'session.db');
  private readonly db: Database.Database;

  constructor() {
    this.ensureDirs();
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureSchema();
  }

  getDbPath(): string {
    return this.dbPath;
  }

  getSessionDir(): string {
    return this.sessionDir;
  }

  listSessions(limit = 20): Array<Record<string, unknown>> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 20;
    const rows = this.db
      .prepare(
        `
          SELECT
            session_id,
            profile_name,
            status,
            message_count,
            created_at,
            updated_at,
            file_path,
            last_user_text,
            last_assistant_text,
            last_error
          FROM agent_sessions
          ORDER BY updated_at DESC
          LIMIT ?
        `,
      )
      .all(safeLimit) as AgentSessionMetaRow[];
    return rows.map((row) => this.rowToMeta(row));
  }

  getSession(
    sessionId: string,
    options?: { includeMessages?: boolean },
  ): Record<string, unknown> | null {
    const row = this.db
      .prepare(
        `
          SELECT
            session_id,
            profile_name,
            status,
            message_count,
            created_at,
            updated_at,
            file_path,
            last_user_text,
            last_assistant_text,
            last_error
          FROM agent_sessions
          WHERE session_id = ?
        `,
      )
      .get(sessionId) as AgentSessionMetaRow | undefined;

    if (!row) return null;
    const meta = this.rowToMeta(row);
    if (!options?.includeMessages) return meta;

    const file = this.readSessionFile(sessionId);
    return {
      ...meta,
      systemPrompt: file?.systemPrompt,
      speechSummaryEnabled: file?.speechSummaryEnabled === true,
      messages: file?.messages ?? [],
      lastRun: file?.lastRun,
    };
  }

  loadSessionFile(sessionId: string): PersistedSessionFile | null {
    return this.readSessionFile(sessionId);
  }

  upsertSession(input: UpsertSessionInput): Record<string, unknown> {
    const now = Date.now();
    const existing = this.readSessionFile(input.sessionId);
    const file: PersistedSessionFile = {
      version: 1,
      sessionId: input.sessionId,
      profileName: input.profileName,
      systemPrompt: input.systemPrompt,
      speechSummaryEnabled: input.speechSummaryEnabled ?? existing?.speechSummaryEnabled ?? false,
      messages: input.messages,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastRun: {
        requestId: input.requestId,
        eventCount: input.eventCount ?? 0,
        lastError: input.lastError,
        finishedAt: now,
      },
    };

    const filePath = this.getSessionFilePath(input.sessionId);
    fs.writeFileSync(filePath, JSON.stringify(file, null, 2) + '\n', 'utf-8');

    const { lastUserText, lastAssistantText } = this.extractLastTexts(input.messages);

    this.db
      .prepare(
        `
          INSERT INTO agent_sessions (
            session_id,
            profile_name,
            status,
            message_count,
            created_at,
            updated_at,
            file_path,
            last_user_text,
            last_assistant_text,
            last_error
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id) DO UPDATE SET
            profile_name=excluded.profile_name,
            status=excluded.status,
            message_count=excluded.message_count,
            updated_at=excluded.updated_at,
            file_path=excluded.file_path,
            last_user_text=excluded.last_user_text,
            last_assistant_text=excluded.last_assistant_text,
            last_error=excluded.last_error
        `,
      )
      .run(
        input.sessionId,
        input.profileName,
        input.lastError ? 'error' : 'ok',
        input.messages.length,
        existing?.createdAt ?? now,
        now,
        filePath,
        lastUserText,
        lastAssistantText,
        input.lastError ?? null,
      );

    return this.getSession(input.sessionId, { includeMessages: false }) ?? {
      sessionId: input.sessionId,
      profileName: input.profileName,
      updatedAt: now,
      messageCount: input.messages.length,
      filePath,
    };
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.secretDir)) {
      fs.mkdirSync(this.secretDir, { recursive: true });
    }
    if (!fs.existsSync(this.sqliteDir)) {
      fs.mkdirSync(this.sqliteDir, { recursive: true });
    }
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        session_id TEXT PRIMARY KEY,
        profile_name TEXT NOT NULL,
        status TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        file_path TEXT NOT NULL,
        last_user_text TEXT,
        last_assistant_text TEXT,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated_at
        ON agent_sessions(updated_at DESC);
    `);
  }

  private getSessionFilePath(sessionId: string): string {
    return path.join(this.sessionDir, `${sessionId}.json`);
  }

  private readSessionFile(sessionId: string): PersistedSessionFile | null {
    const filePath = this.getSessionFilePath(sessionId);
    if (!fs.existsSync(filePath)) return null;

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedSessionFile;
      if (
        !parsed ||
        parsed.version !== 1 ||
        typeof parsed.sessionId !== 'string' ||
        !Array.isArray(parsed.messages)
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private rowToMeta(row: AgentSessionMetaRow): Record<string, unknown> {
    return {
      sessionId: row.session_id,
      profileName: row.profile_name,
      status: row.status,
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      filePath: row.file_path,
      lastUserText: row.last_user_text ?? undefined,
      lastAssistantText: row.last_assistant_text ?? undefined,
      lastError: row.last_error ?? undefined,
    };
  }

  private extractLastTexts(messages: unknown[]): {
    lastUserText: string | null;
    lastAssistantText: string | null;
  } {
    let lastUserText: string | null = null;
    let lastAssistantText: string | null = null;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i] as Record<string, any>;
      if (!msg || typeof msg !== 'object') continue;
      if (lastUserText === null && msg.role === 'user') {
        const content = this.messageToText(msg);
        if (content) lastUserText = content;
      }
      if (lastAssistantText === null && msg.role === 'assistant') {
        const content = this.messageToText(msg);
        if (content) lastAssistantText = content;
      }
      if (lastUserText !== null && lastAssistantText !== null) break;
    }

    return { lastUserText, lastAssistantText };
  }

  private messageToText(message: Record<string, any>): string | null {
    const content = message.content;
    if (typeof content === 'string') return this.shortText(content);
    if (!Array.isArray(content)) return null;
    const texts = content
      .filter((part) => part && typeof part === 'object' && part.type === 'text')
      .map((part) => String(part.text ?? '').trim())
      .filter(Boolean);
    if (texts.length === 0) return null;
    return this.shortText(texts.join(' '));
  }

  private shortText(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 280) return normalized;
    return `${normalized.slice(0, 277)}...`;
  }
}

