import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DocumentRepository } from '../repositories/document.repository';
import { ChunkRepository } from '../repositories/chunk.repository';
import { MarkdownParser } from './markdown-parser';
import { MarkdownChunker } from './markdown-chunker';
import { ObsidianScanner } from './obsidian-scanner';
import { MemoryConfigService } from '../memory-config.service';
import { ReindexStats } from '../types/memory.types';
import { MemoryDocumentEntity } from '../entities/memory-document.entity';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly configService: MemoryConfigService,
    private readonly scanner: ObsidianScanner,
    private readonly parser: MarkdownParser,
    private readonly chunker: MarkdownChunker,
    private readonly documentRepository: DocumentRepository,
    private readonly chunkRepository: ChunkRepository,
  ) {}

  writeDocument(input: {
    sourceType?: string;
    sourceUri: string;
    filePath?: string;
    fileMtime?: number;
    raw: string;
  }): MemoryDocumentEntity {
    const config = this.configService.getConfig();
    const contentHash = this.hash(input.raw);
    const parsed = this.parser.parse({
      sourceUri: input.sourceUri,
      raw: input.raw,
    });
    const chunks = this.chunker.chunk(parsed, config.chunk);
    const existing = this.documentRepository.getBySourceUri(input.sourceUri);

    const document = this.documentRepository.upsert({
      id: existing?.id,
      sourceType: input.sourceType ?? 'manual',
      sourceUri: input.sourceUri,
      title: parsed.title,
      contentHash,
      filePath: input.filePath,
      fileMtime: input.fileMtime,
      metadata: {
        frontmatter: parsed.frontmatter,
      },
    });

    this.chunkRepository.replaceByDocumentId(document.id, chunks);
    return document;
  }

  reindexObsidianVault(): ReindexStats {
    const startedAt = Date.now();
    const config = this.configService.getConfig();
    const files = this.scanner.scan(config);

    const stats: ReindexStats = {
      scanned: files.length,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      failedSources: [],
    };

    for (const file of files) {
      try {
        const contentHash = this.hash(file.content);
        const existing = this.documentRepository.getBySourceUri(file.sourceUri);

        if (existing?.contentHash === contentHash) {
          stats.skipped += 1;
          continue;
        }

        this.writeDocument({
          sourceType: 'obsidian',
          sourceUri: file.sourceUri,
          filePath: file.filePath,
          fileMtime: file.mtimeMs,
          raw: file.content,
        });

        if (existing) {
          stats.updated += 1;
        } else {
          stats.created += 1;
        }
      } catch (error) {
        stats.failed += 1;
        stats.failedSources?.push(file.sourceUri);
        this.logger.warn(
          `reindex failed for ${file.sourceUri}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    stats.durationMs = Date.now() - startedAt;
    this.logger.log(
      `reindex done scanned=${stats.scanned} created=${stats.created} updated=${stats.updated} skipped=${stats.skipped} failed=${stats.failed} durationMs=${stats.durationMs}`,
    );
    return stats;
  }

  private hash(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
