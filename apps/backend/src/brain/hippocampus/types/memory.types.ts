export interface MemoryChunkConfig {
  minChars: number;
  maxChars: number;
  overlapChars: number;
}

export interface MemoryConfig {
  dbPath: string;
  obsidianVaultPath: string;
  ignoreDirs: string[];
  includeExts: string[];
  chunk: MemoryChunkConfig;
}

export interface ParsedMarkdownSection {
  heading?: string;
  depth?: number;
  content: string;
}

export interface ParsedMarkdownDocument {
  sourceUri: string;
  title: string;
  frontmatter: Record<string, unknown>;
  text: string;
  sections: ParsedMarkdownSection[];
}

export interface MemorySearchInput {
  query: string;
  limit?: number;
}

export interface MemorySearchResult {
  chunkId: number;
  chunkUid: string;
  documentId: string;
  title: string;
  heading?: string;
  content: string;
  snippet: string;
  sourceUri: string;
  sourcePath?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface ReindexStats {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs?: number;
  failedSources?: string[];
}
