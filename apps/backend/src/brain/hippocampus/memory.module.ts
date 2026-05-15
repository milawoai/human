import { Module } from '@nestjs/common';
import { BrainLanguageCenterModule } from '../language-center/language-center.module';
import { MemoryDatabaseModule } from './db/memory-database.module';
import { MemoryNeuralService } from './api/memory-neural.service';
import { MemoryConfigService } from './memory-config.service';
import { MemoryService } from './memory.service';
import { DocumentRepository } from './repositories/document.repository';
import { ChunkRepository } from './repositories/chunk.repository';
import { MarkdownParser } from './ingest/markdown-parser';
import { MarkdownChunker } from './ingest/markdown-chunker';
import { QueryNormalizer } from './search/query-normalizer';
import { MemorySearchService } from './search/memory-search.service';
import { ObsidianScanner } from './ingest/obsidian-scanner';
import { IngestService } from './ingest/ingest.service';

@Module({
  imports: [BrainLanguageCenterModule, MemoryDatabaseModule],
  providers: [
    MemoryConfigService,
    MemoryService,
    MemoryNeuralService,
    DocumentRepository,
    ChunkRepository,
    MarkdownParser,
    MarkdownChunker,
    ObsidianScanner,
    IngestService,
    QueryNormalizer,
    MemorySearchService,
  ],
  exports: [
    MemoryConfigService,
    MemoryService,
    MemoryNeuralService,
    DocumentRepository,
    ChunkRepository,
    MarkdownParser,
    MarkdownChunker,
    ObsidianScanner,
    IngestService,
    QueryNormalizer,
    MemorySearchService,
  ],
})
export class MemoryModule {}
