import { Injectable } from '@nestjs/common';
import { MemoryConfigService } from './memory-config.service';
import { IngestService } from './ingest/ingest.service';
import { MemorySearchService } from './search/memory-search.service';
import { ChunkRepository } from './repositories/chunk.repository';
import { DocumentRepository } from './repositories/document.repository';
import { MemorySearchInput } from './types/memory.types';

@Injectable()
export class MemoryService {
  constructor(
    private readonly memoryConfigService: MemoryConfigService,
    private readonly ingestService: IngestService,
    private readonly memorySearchService: MemorySearchService,
    private readonly documentRepository: DocumentRepository,
    private readonly chunkRepository: ChunkRepository,
  ) {}

  getConfig() {
    return this.memoryConfigService.getConfig();
  }

  reindexObsidianVault() {
    return this.ingestService.reindexObsidianVault();
  }

  writeDocument(input: {
    sourceType?: string;
    sourceUri: string;
    filePath?: string;
    fileMtime?: number;
    raw: string;
  }) {
    return this.ingestService.writeDocument(input);
  }

  search(input: MemorySearchInput) {
    return this.memorySearchService.search(input);
  }

  getDocument(documentId: string) {
    return this.documentRepository.getById(documentId);
  }

  getChunk(chunkId: number) {
    return this.chunkRepository.getById(chunkId);
  }
}
