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

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  title,
  heading,
  content,
  content='memory_chunks',
  content_rowid='id',
  tokenize='unicode61'
);
