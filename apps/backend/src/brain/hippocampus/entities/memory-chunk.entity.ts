export interface MemoryChunkEntity {
  id: number;
  documentId: string;
  chunkIndex: number;
  chunkUid: string;
  heading?: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertMemoryChunkInput {
  chunkIndex: number;
  heading?: string;
  content: string;
  metadata?: Record<string, unknown>;
}
