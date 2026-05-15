import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TOPIC } from 'neural-topics';
import type { BusMessage, Capability } from '../../../neural/interfaces';
import type { InternalCommandHandler } from '../../../neural/neural-http/neural-http.service';
import { NeuralHttpService } from '../../../neural/neural-http/neural-http.service';
import { NeuralCoreService } from '../../../neural/neural-core/neural-core.service';
import { MemoryService } from '../memory.service';

const BRAIN_HIPPOCAMPUS_ACTOR = {
  actorId: 'brain-main',
  runtime: 'nest' as const,
  system: 'brain' as const,
  module: 'hippocampus',
};

const MEMORY_CAPABILITIES: Capability[] = [
  {
    id: 'brain.hippocampus.memory.write',
    actor: BRAIN_HIPPOCAMPUS_ACTOR,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_WRITE,
    kinds: ['command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.hippocampus.memory.search',
    actor: BRAIN_HIPPOCAMPUS_ACTOR,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_SEARCH,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.hippocampus.memory.document.get',
    actor: BRAIN_HIPPOCAMPUS_ACTOR,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_DOCUMENT_GET,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.hippocampus.memory.chunk.get',
    actor: BRAIN_HIPPOCAMPUS_ACTOR,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_CHUNK_GET,
    kinds: ['query'],
    mode: 'once',
    enabled: true,
    online: true,
  },
  {
    id: 'brain.hippocampus.memory.reindex',
    actor: BRAIN_HIPPOCAMPUS_ACTOR,
    topic: TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_REINDEX,
    kinds: ['command'],
    mode: 'once',
    enabled: true,
    online: true,
  },
];

@Injectable()
export class MemoryNeuralService implements OnModuleInit, InternalCommandHandler {
  private readonly logger = new Logger(MemoryNeuralService.name);

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly httpService: NeuralHttpService,
    private readonly memoryService: MemoryService,
  ) {}

  onModuleInit() {
    this.coreService.registerInternalActor(BRAIN_HIPPOCAMPUS_ACTOR);
    this.coreService.registerCapabilities(MEMORY_CAPABILITIES);
    this.httpService.registerCommandHandler(this);
    this.logger.log('MemoryNeuralService 已注册为内部命令处理器');
  }

  canHandle(topic: string): boolean {
    return topic.startsWith('brain.hippocampus.memory');
  }

  async handleCommand(
    message: BusMessage,
  ): Promise<{ success: boolean; data?: any; msg?: string }> {
    try {
      const payload = this.ensureObject(message.payload);

      switch (message.topic) {
        case TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_WRITE:
          return {
            success: true,
            data: this.memoryService.writeDocument({
              sourceType: this.readString(payload.sourceType),
              sourceUri: this.requireString(payload.sourceUri, 'sourceUri'),
              filePath: this.readString(payload.filePath),
              fileMtime: this.readNumber(payload.fileMtime),
              raw: this.requireString(payload.raw, 'raw'),
            }),
          };

        case TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_SEARCH:
          return {
            success: true,
            data: this.memoryService.search({
              query: this.requireString(payload.query, 'query'),
              limit: this.readNumber(payload.limit),
            }),
          };

        case TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_DOCUMENT_GET: {
          const document = this.memoryService.getDocument(
            this.requireString(payload.documentId, 'documentId'),
          );
          return document
            ? { success: true, data: document }
            : { success: false, msg: 'document not found' };
        }

        case TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_CHUNK_GET: {
          const chunk = this.memoryService.getChunk(
            this.requireNumber(payload.chunkId, 'chunkId'),
          );
          return chunk ? { success: true, data: chunk } : { success: false, msg: 'chunk not found' };
        }

        case TOPIC.BRAIN_HIPPOCAMPUS_MEMORY_REINDEX:
          return {
            success: true,
            data: this.memoryService.reindexObsidianVault(),
          };

        default:
          return { success: false, msg: `Memory 无法处理 topic: ${message.topic}` };
      }
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private ensureObject(value: unknown): Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private requireString(value: unknown, field: string): string {
    const result = this.readString(value);
    if (!result) {
      throw new Error(`payload.${field} is required`);
    }
    return result;
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private requireNumber(value: unknown, field: string): number {
    const result = this.readNumber(value);
    if (result === undefined) {
      throw new Error(`payload.${field} is required`);
    }
    return result;
  }
}
