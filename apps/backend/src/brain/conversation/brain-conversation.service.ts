import * as fs from 'node:fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ACTOR, CAP, TOPIC } from 'neural-topics';
import type { BusMessage, Capability } from '../../neural/interfaces';
import type { InternalCommandHandler } from '../../neural/neural-http/neural-http.service';
import { NeuralHttpService } from '../../neural/neural-http/neural-http.service';
import { NeuralCoreService } from '../../neural/neural-core/neural-core.service';
import { ConversationIndexStore } from './conversation-index.store';

const loadPi = (): Promise<typeof import('@earendil-works/pi-coding-agent')> =>
  new Function('return import("@earendil-works/pi-coding-agent")')();

const CAPABILITIES = [
  CAP.BRAIN_CONVERSATION_CREATE,
  CAP.BRAIN_CONVERSATION_CURRENT_GET,
  CAP.BRAIN_CONVERSATION_TRANSCRIPT_GET,
] as unknown as Capability[];

@Injectable()
export class BrainConversationService implements OnModuleInit, InternalCommandHandler {
  private readonly logger = new Logger(BrainConversationService.name);

  constructor(
    private readonly core: NeuralCoreService,
    private readonly http: NeuralHttpService,
    private readonly index: ConversationIndexStore,
  ) {}

  onModuleInit(): void {
    this.index.reconcileAvailableFiles();
    this.core.registerInternalActor(ACTOR.BRAIN_CONVERSATION);
    this.core.registerCapabilities(CAPABILITIES);
    this.http.registerCommandHandler(this);
    this.logger.log('BrainConversationService 已注册为内部命令处理器');
  }

  canHandle(topic: string): boolean {
    return topic.startsWith('brain.conversation.');
  }

  async handleCommand(message: BusMessage): Promise<{ success: boolean; data?: any; msg?: string; code?: string }> {
    try {
      const payload = this.object(message.payload);
      switch (message.topic) {
        case TOPIC.BRAIN_CONVERSATION_CREATE:
          this.requireKind(message, 'command');
          if (payload.conversationType !== undefined && payload.conversationType !== 'companion') {
            throw new Error('payload.conversationType must be companion');
          }
          return { success: true, data: { conversation: this.index.create({ conversationType: 'companion' }) } };
        case TOPIC.BRAIN_CONVERSATION_CURRENT_GET:
          this.requireKind(message, 'query');
          return { success: true, data: { conversation: this.index.current('companion') } };
        case TOPIC.BRAIN_CONVERSATION_TRANSCRIPT_GET:
          this.requireKind(message, 'query');
          return { success: true, data: await this.readTranscript(this.requireId(payload.conversationId)) };
        default:
          return { success: false, code: 'CONVERSATION_TOPIC_UNSUPPORTED', msg: 'Unsupported conversation topic' };
      }
    } catch (error) {
      return {
        success: false,
        code: 'CONVERSATION_INVALID_REQUEST',
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async readTranscript(conversationId: string) {
    const record = this.index.getInternalRecord(conversationId);
    if (!record) throw new Error('Conversation not found');
    if (record.status === 'pending') return { conversationId, messages: [] };
    if (record.status !== 'available' || !record.piSessionPath || !fs.existsSync(record.piSessionPath)) {
      throw new Error('Conversation transcript is unavailable');
    }
    const { SessionManager } = await loadPi();
    const manager = SessionManager.open(record.piSessionPath);
    const messages = manager.getBranch()
      .filter((entry): entry is Extract<typeof entry, { type: 'message' }> => entry.type === 'message')
      .filter(entry => entry.message.role === 'user' || entry.message.role === 'assistant')
      .map(entry => ({
        id: entry.id,
        role: entry.message.role,
        content: this.messageText(entry.message),
        timestamp: entry.message.timestamp,
      }));
    return { conversationId, messages };
  }

  private messageText(message: any): string {
    if (typeof message.content === 'string') return message.content;
    return Array.isArray(message.content)
      ? message.content.filter((part: any) => part.type === 'text').map((part: any) => part.text ?? '').join('')
      : '';
  }

  private requireKind(message: BusMessage, kind: 'command' | 'query'): void {
    if (message.kind !== kind) throw new Error(`message.kind must be ${kind}`);
  }

  private requireId(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) {
      throw new Error('payload.conversationId must be a UUID');
    }
    return value;
  }

  private object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  }
}
