import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import Database from 'better-sqlite3';
import { MemoryConfigService } from '../memory-config.service';

@Injectable()
export class MemoryDatabaseService {
  private readonly db: Database.Database;

  constructor(private readonly memoryConfigService: MemoryConfigService) {
    const config = this.memoryConfigService.getConfig();
    const dbPath = config.dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ensureSchema();
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_documents (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_uri TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        file_path TEXT,
        file_mtime INTEGER,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_memory_documents_source_type
        ON memory_documents(source_type);

      CREATE INDEX IF NOT EXISTS idx_memory_documents_updated_at
        ON memory_documents(updated_at DESC);

      CREATE TABLE IF NOT EXISTS memory_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_uid TEXT NOT NULL UNIQUE,
        heading TEXT,
        content TEXT NOT NULL,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(document_id) REFERENCES memory_documents(id) ON DELETE CASCADE,
        UNIQUE(document_id, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS idx_memory_chunks_document_id
        ON memory_chunks(document_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        title,
        heading,
        content,
        content='memory_chunks',
        content_rowid='id',
        tokenize='unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS memory_chunks_ai AFTER INSERT ON memory_chunks BEGIN
        INSERT INTO memory_fts(rowid, title, heading, content)
        VALUES (
          new.id,
          COALESCE((SELECT title FROM memory_documents WHERE id = new.document_id), ''),
          COALESCE(new.heading, ''),
          new.content
        );
      END;

      CREATE TRIGGER IF NOT EXISTS memory_chunks_ad AFTER DELETE ON memory_chunks BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, title, heading, content)
        VALUES('delete', old.id, '', '', '');
      END;

      CREATE TRIGGER IF NOT EXISTS memory_chunks_au AFTER UPDATE ON memory_chunks BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, title, heading, content)
        VALUES('delete', old.id, '', '', '');
        INSERT INTO memory_fts(rowid, title, heading, content)
        VALUES (
          new.id,
          COALESCE((SELECT title FROM memory_documents WHERE id = new.document_id), ''),
          COALESCE(new.heading, ''),
          new.content
        );
      END;
    `);
  }
}
