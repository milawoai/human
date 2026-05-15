export interface MemoryDocumentEntity {
  id: string;
  sourceType: string;
  sourceUri: string;
  title: string;
  contentHash: string;
  filePath?: string;
  fileMtime?: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertMemoryDocumentInput {
  id?: string;
  sourceType: string;
  sourceUri: string;
  title: string;
  contentHash: string;
  filePath?: string;
  fileMtime?: number;
  metadata?: Record<string, unknown>;
}
