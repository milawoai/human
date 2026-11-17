import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Inject, Injectable, Optional } from '@nestjs/common';
import Database from 'better-sqlite3';

export const TOOL_ROUTING_DB_PATH = Symbol('TOOL_ROUTING_DB_PATH');

export interface ToolRoutingScoreItem {
  toolId: string;
  category?: string;
  probability: number;
}

export interface ToolRoutingLogEntry {
  id: string;
  sessionId: string;
  requestId: string;
  mode: 'off' | 'shadow' | 'active';
  userText: string;
  candidateCount: number;
  predictedTools: string[];
  scores: ToolRoutingScoreItem[];
  actualTools: string[];
  searchedQueries: string[];
  falseNegatives: string[];
  isFalseNegative: boolean;
  routerSource: string;
  latencyMs: number;
  createdAt: number;
}

export interface FewShotRoutingExample {
  id: string;
  userText: string;
  actualTools: string[];
  falseNegatives: string[];
  isFalseNegative: boolean;
  similarity: number;
}

interface RoutingLogRow {
  id: string;
  session_id: string;
  request_id: string;
  mode: string;
  user_text: string;
  candidate_count: number;
  predicted_tools_json: string;
  scores_json: string;
  actual_tools_json: string;
  searched_queries_json: string;
  false_negatives_json: string;
  is_false_negative: number;
  router_source: string;
  latency_ms: number;
  created_at: number;
}

/**
 * 基底节（Basal Ganglia）工具路由日志与错题本存储
 *
 * 存储在 ~/.ai_secretary/sqlite/session.db 的 tool_routing_logs 表中：
 * - 记录每轮小模型预测工具集 R 与主脑实际调用工具集 A
 * - 自动标注漏选错题（is_false_negative = 1，即 t ∉ R 但主脑通过 tool_search 或直接调用成功）
 * - 为后续相似任务提供毫秒级动态 Few-shot 错题/经验检索（第一层快进化）
 */
@Injectable()
export class ToolRoutingLogStore {
  private readonly dbPath: string;
  private readonly db: Database.Database;

  constructor(@Optional() @Inject(TOOL_ROUTING_DB_PATH) customDbPath?: string) {
    const homeDir = process.env.HOME || os.homedir();
    const sqliteDir = path.join(homeDir, '.ai_secretary', 'sqlite');
    this.dbPath = customDbPath ?? path.join(sqliteDir, 'session.db');
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureSchema();
  }

  getDbPath(): string {
    return this.dbPath;
  }

  recordLog(input: Omit<ToolRoutingLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: number }): ToolRoutingLogEntry {
    const entry: ToolRoutingLogEntry = {
      id: input.id ?? crypto.randomUUID(),
      sessionId: input.sessionId,
      requestId: input.requestId,
      mode: input.mode,
      userText: input.userText,
      candidateCount: input.candidateCount,
      predictedTools: input.predictedTools,
      scores: input.scores,
      actualTools: input.actualTools,
      searchedQueries: input.searchedQueries,
      falseNegatives: input.falseNegatives,
      isFalseNegative: input.isFalseNegative,
      routerSource: input.routerSource,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      createdAt: input.createdAt ?? Date.now(),
    };

    this.db
      .prepare(
        `
        INSERT INTO tool_routing_logs (
          id,
          session_id,
          request_id,
          mode,
          user_text,
          candidate_count,
          predicted_tools_json,
          scores_json,
          actual_tools_json,
          searched_queries_json,
          false_negatives_json,
          is_false_negative,
          router_source,
          latency_ms,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        entry.id,
        entry.sessionId,
        entry.requestId,
        entry.mode,
        entry.userText,
        entry.candidateCount,
        JSON.stringify(entry.predictedTools),
        JSON.stringify(entry.scores),
        JSON.stringify(entry.actualTools),
        JSON.stringify(entry.searchedQueries),
        JSON.stringify(entry.falseNegatives),
        entry.isFalseNegative ? 1 : 0,
        entry.routerSource,
        entry.latencyMs,
        entry.createdAt,
      );

    return entry;
  }

  listLogs(options?: { limit?: number; onlyFalseNegatives?: boolean; sessionId?: string }): ToolRoutingLogEntry[] {
    const limit = Math.max(1, Math.min(200, Math.trunc(options?.limit ?? 30)));
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (options?.onlyFalseNegatives) {
      clauses.push('is_false_negative = 1');
    }
    if (options?.sessionId) {
      clauses.push('session_id = ?');
      params.push(options.sessionId);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM tool_routing_logs
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(...params, limit) as RoutingLogRow[];

    return rows.map((r) => this.rowToEntry(r));
  }

  /**
   * 检索与当前用户任务最相似的历史路由经验（分别保留近期错题配额与近期成功经验配额，防止一方挤出另一方）
   */
  findSimilarExamples(userText: string, limit = 2): FewShotRoutingExample[] {
    const queryTokens = this.tokenize(userText);
    if (queryTokens.size === 0) return [];

    // 分别取最近 100 条错题记录 + 最近 100 条非错题成功记录，避免 200 条历史错题把最新成功经验挤出候选池
    const fnRows = this.db
      .prepare(
        `
        SELECT *
        FROM tool_routing_logs
        WHERE actual_tools_json != '[]' AND is_false_negative = 1
        ORDER BY created_at DESC
        LIMIT 100
      `,
      )
      .all() as RoutingLogRow[];

    const okRows = this.db
      .prepare(
        `
        SELECT *
        FROM tool_routing_logs
        WHERE actual_tools_json != '[]' AND is_false_negative = 0
        ORDER BY created_at DESC
        LIMIT 100
      `,
      )
      .all() as RoutingLogRow[];

    // 按最新时间优先合并去重，若同一 user_text 既有错题又有修正记录，保留最新或错题标记
    const rows = [...fnRows, ...okRows].sort((a, b) => b.created_at - a.created_at);

    const scored: FewShotRoutingExample[] = [];
    const seenTexts = new Set<string>();

    for (const row of rows) {
      const normalized = row.user_text.trim();
      if (!normalized || seenTexts.has(normalized)) continue;
      const actualTools = this.safeParseArray<string>(row.actual_tools_json);
      if (actualTools.length === 0) continue;

      const docTokens = this.tokenize(normalized);
      const overlap = this.computeSimilarity(queryTokens, docTokens);
      if (overlap <= 0.08) continue;

      seenTexts.add(normalized);
      const isFn = row.is_false_negative === 1;
      // 错题本给予 1.35x 权重提升，确保曾漏选过的同类表达优先注入
      const boostedScore = overlap * (isFn ? 1.35 : 1.0);

      scored.push({
        id: row.id,
        userText: normalized,
        actualTools,
        falseNegatives: this.safeParseArray<string>(row.false_negatives_json),
        isFalseNegative: isFn,
        similarity: Number(boostedScore.toFixed(4)),
      });
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, Math.max(1, limit));
  }

  getStats(): {
    totalRuns: number;
    falseNegativeCount: number;
    avgLatencyMs: number;
  } {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) as total_runs,
          SUM(CASE WHEN is_false_negative = 1 THEN 1 ELSE 0 END) as fn_count,
          AVG(latency_ms) as avg_latency
        FROM tool_routing_logs
      `,
      )
      .get() as { total_runs: number; fn_count: number | null; avg_latency: number | null };

    return {
      totalRuns: row?.total_runs ?? 0,
      falseNegativeCount: row?.fn_count ?? 0,
      avgLatencyMs: Math.round(row?.avg_latency ?? 0),
    };
  }

  private tokenize(text: string): Set<string> {
    const cleaned = text.toLowerCase().trim();
    const tokens = new Set<string>();
    // 英文单词/数字词元
    const words = cleaned.match(/[a-z0-9_.-]{2,}/g) ?? [];
    for (const w of words) tokens.add(w);
    // 中文字符与二元语法（bigrams），兼顾短句语义匹配
    const cjkChars = cleaned.match(/[\u4e00-\u9fa5]/g) ?? [];
    for (let i = 0; i < cjkChars.length; i++) {
      tokens.add(cjkChars[i]);
      if (i + 1 < cjkChars.length) {
        tokens.add(cjkChars[i] + cjkChars[i + 1]);
      }
    }
    return tokens;
  }

  private computeSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private rowToEntry(row: RoutingLogRow): ToolRoutingLogEntry {
    return {
      id: row.id,
      sessionId: row.session_id,
      requestId: row.request_id,
      mode: (row.mode as ToolRoutingLogEntry['mode']) || 'shadow',
      userText: row.user_text,
      candidateCount: row.candidate_count,
      predictedTools: this.safeParseArray<string>(row.predicted_tools_json),
      scores: this.safeParseArray<ToolRoutingScoreItem>(row.scores_json),
      actualTools: this.safeParseArray<string>(row.actual_tools_json),
      searchedQueries: this.safeParseArray<string>(row.searched_queries_json),
      falseNegatives: this.safeParseArray<string>(row.false_negatives_json),
      isFalseNegative: row.is_false_negative === 1,
      routerSource: row.router_source,
      latencyMs: row.latency_ms,
      createdAt: row.created_at,
    };
  }

  private safeParseArray<T>(raw: string | null | undefined): T[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_routing_logs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        user_text TEXT NOT NULL,
        candidate_count INTEGER NOT NULL,
        predicted_tools_json TEXT NOT NULL,
        scores_json TEXT NOT NULL,
        actual_tools_json TEXT NOT NULL,
        searched_queries_json TEXT NOT NULL,
        false_negatives_json TEXT NOT NULL,
        is_false_negative INTEGER NOT NULL DEFAULT 0,
        router_source TEXT NOT NULL,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tool_routing_logs_session
        ON tool_routing_logs(session_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tool_routing_logs_fn
        ON tool_routing_logs(is_false_negative, created_at DESC);
    `);
  }
}
