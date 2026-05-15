import { Injectable } from '@nestjs/common';
import { MemoryDatabaseService } from '../db/memory-database.service';
import { MemoryChunkEntity, UpsertMemoryChunkInput } from '../entities/memory-chunk.entity';

interface MemoryChunkRow {
  id: number;
  document_id: string;
  chunk_index: number;
  chunk_uid: string;
  heading: string | null;
  content: string;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

@Injectable()
export class ChunkRepository {
  constructor(private readonly memoryDatabaseService: MemoryDatabaseService) {}

  replaceByDocumentId(documentId: string, chunks: UpsertMemoryChunkInput[]): MemoryChunkEntity[] {
    const db = this.memoryDatabaseService.getDatabase();
    const now = Date.now();

    const run = db.transaction(() => {
      db.prepare('DELETE FROM memory_chunks WHERE document_id = ?').run(documentId);

      const insert = db.prepare(
        `
        INSERT INTO memory_chunks (
          document_id, chunk_index, chunk_uid, heading, content, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
      );

      for (const chunk of chunks) {
        insert.run(
          documentId,
          chunk.chunkIndex,
          `${documentId}#chunk-${chunk.chunkIndex}`,
          chunk.heading ?? null,
          chunk.content,
          JSON.stringify(chunk.metadata ?? {}),
          now,
          now,
        );
      }
    });

    run();

    return this.listByDocumentId(documentId);
  }

  listByDocumentId(documentId: string): MemoryChunkEntity[] {
    const rows = this.memoryDatabaseService
      .getDatabase()
      .prepare('SELECT * FROM memory_chunks WHERE document_id = ? ORDER BY chunk_index ASC')
      .all(documentId) as MemoryChunkRow[];

    return rows.map((row) => this.toEntity(row));
  }

  getById(id: number): MemoryChunkEntity | null {
    const row = this.memoryDatabaseService
      .getDatabase()
      .prepare('SELECT * FROM memory_chunks WHERE id = ?')
      .get(id) as MemoryChunkRow | undefined;
    return row ? this.toEntity(row) : null;
  }

  private toEntity(row: MemoryChunkRow): MemoryChunkEntity {
    return {
      id: row.id,
      documentId: row.document_id,
      chunkIndex: row.chunk_index,
      chunkUid: row.chunk_uid,
      heading: row.heading ?? undefined,
      content: row.content,
      metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
