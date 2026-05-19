import { Injectable } from '@nestjs/common';
import { MemoryDatabaseService } from '../db/memory-database.service';
import { MemorySearchInput, MemorySearchResult } from '../types/memory.types';
import { QueryNormalizer } from './query-normalizer';

interface SearchRow {
  chunk_id: number;
  chunk_uid: string;
  document_id: string;
  title: string;
  heading: string | null;
  content: string;
  snippet: string;
  source_uri: string;
  source_path: string | null;
  score: number;
  metadata_json: string | null;
}

@Injectable()
export class MemorySearchService {
  constructor(
    private readonly memoryDatabaseService: MemoryDatabaseService,
    private readonly queryNormalizer: QueryNormalizer,
  ) {}

  search(input: MemorySearchInput): MemorySearchResult[] {
    const normalized = this.queryNormalizer.normalize(input.query);
    if (!normalized) return [];

    const limit = Math.max(1, Math.min(50, Math.trunc(input.limit ?? 10)));
    let rows = this.searchByMatch(normalized, limit);

    // Fallback: SQLite FTS space-separated terms are typically interpreted as AND.
    // If strict match returns nothing, relax to OR to improve recall for multi-term queries.
    if (rows.length === 0) {
      const terms = normalized.split(' ').map((part) => part.trim()).filter(Boolean);
      if (terms.length > 1) {
        const relaxed = terms.join(' OR ');
        rows = this.searchByMatch(relaxed, limit);
      }
    }

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      chunkUid: row.chunk_uid,
      documentId: row.document_id,
      title: row.title,
      heading: row.heading ?? undefined,
      content: row.content,
      snippet: row.snippet,
      sourceUri: row.source_uri,
      sourcePath: row.source_path ?? undefined,
      score: row.score,
      metadata: row.metadata_json
        ? (JSON.parse(row.metadata_json) as Record<string, unknown>)
        : undefined,
    }));
  }

  private searchByMatch(matchQuery: string, limit: number): SearchRow[] {
    return this.memoryDatabaseService
      .getDatabase()
      .prepare(
        `
        SELECT
          c.id AS chunk_id,
          c.chunk_uid AS chunk_uid,
          d.id AS document_id,
          d.title AS title,
          c.heading AS heading,
          c.content AS content,
          substr(c.content, 1, 180) AS snippet,
          d.source_uri AS source_uri,
          d.file_path AS source_path,
          0.0 AS score,
          c.metadata_json AS metadata_json
        FROM memory_fts
        JOIN memory_chunks c ON c.id = memory_fts.rowid
        JOIN memory_documents d ON d.id = c.document_id
        WHERE memory_fts MATCH ?
        ORDER BY c.id DESC
        LIMIT ?
        `,
      )
      .all(matchQuery, limit) as SearchRow[];
  }
}
