import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MemoryDatabaseService } from '../db/memory-database.service';
import { MemoryDocumentEntity, UpsertMemoryDocumentInput } from '../entities/memory-document.entity';

interface MemoryDocumentRow {
  id: string;
  source_type: string;
  source_uri: string;
  title: string;
  content_hash: string;
  file_path: string | null;
  file_mtime: number | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

@Injectable()
export class DocumentRepository {
  constructor(private readonly memoryDatabaseService: MemoryDatabaseService) {}

  upsert(input: UpsertMemoryDocumentInput): MemoryDocumentEntity {
    const db = this.memoryDatabaseService.getDatabase();
    const now = Date.now();
    const id = input.id ?? randomUUID();

    db.prepare(
      `
      INSERT INTO memory_documents (
        id, source_type, source_uri, title, content_hash, file_path, file_mtime, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_uri) DO UPDATE SET
        source_type=excluded.source_type,
        title=excluded.title,
        content_hash=excluded.content_hash,
        file_path=excluded.file_path,
        file_mtime=excluded.file_mtime,
        metadata_json=excluded.metadata_json,
        updated_at=excluded.updated_at
      `,
    ).run(
      id,
      input.sourceType,
      input.sourceUri,
      input.title,
      input.contentHash,
      input.filePath ?? null,
      input.fileMtime ?? null,
      JSON.stringify(input.metadata ?? {}),
      now,
      now,
    );

    const row = db
      .prepare('SELECT * FROM memory_documents WHERE source_uri = ?')
      .get(input.sourceUri) as MemoryDocumentRow | undefined;

    if (!row) {
      throw new Error('upsert memory document failed: row not found');
    }

    return this.toEntity(row);
  }

  getById(id: string): MemoryDocumentEntity | null {
    const row = this.memoryDatabaseService
      .getDatabase()
      .prepare('SELECT * FROM memory_documents WHERE id = ?')
      .get(id) as MemoryDocumentRow | undefined;
    return row ? this.toEntity(row) : null;
  }

  getBySourceUri(sourceUri: string): MemoryDocumentEntity | null {
    const row = this.memoryDatabaseService
      .getDatabase()
      .prepare('SELECT * FROM memory_documents WHERE source_uri = ?')
      .get(sourceUri) as MemoryDocumentRow | undefined;
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: MemoryDocumentRow): MemoryDocumentEntity {
    return {
      id: row.id,
      sourceType: row.source_type,
      sourceUri: row.source_uri,
      title: row.title,
      contentHash: row.content_hash,
      filePath: row.file_path ?? undefined,
      fileMtime: row.file_mtime ?? undefined,
      metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
