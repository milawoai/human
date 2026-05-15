import { Injectable } from '@nestjs/common';
import {
  MemoryChunkConfig,
  ParsedMarkdownDocument,
} from '../types/memory.types';
import { UpsertMemoryChunkInput } from '../entities/memory-chunk.entity';

@Injectable()
export class MarkdownChunker {
  chunk(document: ParsedMarkdownDocument, config: MemoryChunkConfig): UpsertMemoryChunkInput[] {
    const chunks: UpsertMemoryChunkInput[] = [];
    let chunkIndex = 0;

    for (const section of document.sections) {
      const sectionText = section.content.trim();
      if (!sectionText) continue;

      const sectionChunks = this.splitByMaxChars(sectionText, config);
      for (const sectionChunk of sectionChunks) {
        chunks.push({
          chunkIndex,
          heading: section.heading,
          content: sectionChunk,
          metadata: {
            heading: section.heading,
            headingDepth: section.depth,
            sourceUri: document.sourceUri,
          },
        });
        chunkIndex += 1;
      }
    }

    return this.mergeSmallChunks(chunks, config.minChars);
  }

  private splitByMaxChars(text: string, config: MemoryChunkConfig): string[] {
    if (text.length <= config.maxChars) {
      return [text];
    }

    const parts: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + config.maxChars, text.length);
      parts.push(text.slice(start, end).trim());
      if (end >= text.length) break;
      start = Math.max(0, end - config.overlapChars);
    }

    return parts.filter(Boolean);
  }

  private mergeSmallChunks(
    chunks: UpsertMemoryChunkInput[],
    minChars: number,
  ): UpsertMemoryChunkInput[] {
    if (chunks.length <= 1) return chunks;

    const merged: UpsertMemoryChunkInput[] = [];

    for (const chunk of chunks) {
      const prev = merged[merged.length - 1];
      if (!prev) {
        merged.push(chunk);
        continue;
      }

      if (prev.content.length >= minChars || chunk.content.length >= minChars) {
        merged.push(chunk);
        continue;
      }

      prev.content = `${prev.content}\n\n${chunk.content}`;
      prev.metadata = {
        ...(prev.metadata ?? {}),
        merged: true,
      };
    }

    return merged.map((chunk, idx) => ({ ...chunk, chunkIndex: idx }));
  }
}
