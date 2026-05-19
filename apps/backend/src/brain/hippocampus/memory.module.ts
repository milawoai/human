import { Module } from '@nestjs/common';
import { BrainLanguageCenterModule } from '../language-center/language-center.module';
import { MemoryDatabaseModule } from './db/memory-database.module';
import { MemoryNeuralService } from './api/memory-neural.service';
import { MemoryService } from './memory.service';
import { NeuralHttpModule } from '../../neural/neural-http/neural-http.module';
import { DocumentRepository } from './repositories/document.repository';
import { ChunkRepository } from './repositories/chunk.repository';
import { MarkdownParser } from './ingest/markdown-parser';
import { MarkdownChunker } from './ingest/markdown-chunker';
import { QueryNormalizer } from './search/query-normalizer';
import { MemorySearchService } from './search/memory-search.service';
import { ObsidianScanner } from './ingest/obsidian-scanner';
import { IngestService } from './ingest/ingest.service';

@Module({
  imports: [BrainLanguageCenterModule, MemoryDatabaseModule, NeuralHttpModule],
  providers: [
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
