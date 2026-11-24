import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { visibleSpeechAnswer } from '../speech/speech-summary';
import { ConversationIndexStore } from './conversation-index.store';
import { CompanionTurnContext } from './companion-extension';
import { PiConversationFactory } from './pi-conversation.factory';

export interface CompanionAskInput {
  conversationId: string;
  requestId: string;
  question: string;
  profileName?: string;
  memoryText?: string;
  speechSummaryEnabled?: boolean;
  timeoutMs?: number;
}

export interface CompanionRuntimeEvent {
  type: 'think' | 'chunk';
  content: string;
}

export interface CompanionAskResult {
  requestId: string;
  confirmedQuestion: string;
  think: string;
  answer: string;
  summary?: string;
  stopReason?: string;
  errorMessage?: string;
}

export class CompanionRuntimeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

interface ActiveRun {
  requestId: string;
  rawAnswer: string;
  emittedAnswer: string;
  think: string;
  settled: Promise<void>;
  resolveSettled: () => void;
  onEvent?: (event: CompanionRuntimeEvent) => void;
  aborted: boolean;
}

interface RuntimeEntry {
  profileKey: string;
  session: any;
  turnContext: CompanionTurnContext;
  unsubscribe: () => void;
  dispose: () => void;
  active?: ActiveRun;
}

@Injectable()
export class CompanionRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(CompanionRuntimeService.name);
  private readonly runtimes = new Map<string, RuntimeEntry>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly factory: PiConversationFactory,
    private readonly index: ConversationIndexStore,
  ) {}

  async ask(input: CompanionAskInput, onEvent?: (event: CompanionRuntimeEvent) => void): Promise<CompanionAskResult> {
    const conversation = this.index.get(input.conversationId);
    if (!conversation) {
      throw new CompanionRuntimeError('CONVERSATION_NOT_FOUND', 'Conversation not found');
    }
    if (conversation.status === 'unavailable') {
      throw new CompanionRuntimeError('CONVERSATION_UNAVAILABLE', 'Conversation is unavailable');
    }
    if (this.inFlight.has(input.conversationId)) {
      throw new CompanionRuntimeError('CONVERSATION_BUSY', 'Conversation is busy');
    }
    this.inFlight.add(input.conversationId);
    try {
      return await this.askReserved(input, onEvent);
    } finally {
      this.inFlight.delete(input.conversationId);
    }
  }

  private async askReserved(input: CompanionAskInput, onEvent?: (event: CompanionRuntimeEvent) => void): Promise<CompanionAskResult> {
    const profileKey = await this.factory.resolveProfileKey(input.profileName);
    let entry = this.runtimes.get(input.conversationId);
    if (entry?.active) throw new CompanionRuntimeError('CONVERSATION_BUSY', 'Conversation is busy');
    if (entry && entry.profileKey !== profileKey) {
      entry.unsubscribe();
      entry.dispose();
      this.runtimes.delete(input.conversationId);
      entry = undefined;
    }
    if (!entry) entry = await this.openRuntime(input, profileKey);

    let resolveSettled = () => {};
    const settled = new Promise<void>((resolve) => { resolveSettled = resolve; });
    const active: ActiveRun = {
      requestId: input.requestId,
      rawAnswer: '',
      emittedAnswer: '',
      think: '',
      settled,
      resolveSettled,
      onEvent,
      aborted: false,
    };
    entry.active = active;
    Object.assign(entry.turnContext, {
      memoryText: input.memoryText,
      speechSummaryEnabled: input.speechSummaryEnabled === true,
      onSpeechSummary: (summary: string | undefined) => { activeSummary = summary; },
    });

    let activeSummary: string | undefined;
    let timedOut = false;
    const timeoutMs = input.timeoutMs ?? 600_000;
    const timer = setTimeout(() => {
      timedOut = true;
      entry?.session.abort();
    }, timeoutMs);
    try {
      await entry.session.prompt(input.question);
      await active.settled;
      if (timedOut) throw new CompanionRuntimeError('CONVERSATION_TIMEOUT', 'Conversation request timed out');
      if (active.aborted) throw new CompanionRuntimeError('CONVERSATION_CANCELLED', 'Conversation request cancelled');
      const finalMessage = [...entry.session.state.messages].reverse()
        .find((message: any) => message.role === 'assistant');
      const errorMessage = entry.session.state.errorMessage ?? finalMessage?.errorMessage;
      if (errorMessage) throw new CompanionRuntimeError('CONVERSATION_FAILED', 'Conversation request failed');
      const answer = this.assistantText(finalMessage).trim();
      const sessionFile = entry.session.sessionManager.getSessionFile();
      if (sessionFile) this.index.markAvailable(input.conversationId, sessionFile);
      return {
        requestId: input.requestId,
        confirmedQuestion: input.question,
        think: active.think.trim(),
        answer,
        summary: activeSummary,
        stopReason: finalMessage?.stopReason,
      };
    } catch (error) {
      if (entry.active === active) {
        entry.session.abort();
        entry.active = undefined;
        active.resolveSettled();
        entry.unsubscribe();
        entry.dispose();
        if (this.runtimes.get(input.conversationId) === entry) this.runtimes.delete(input.conversationId);
      }
      if (error instanceof CompanionRuntimeError) throw error;
      this.logger.error(`Pi companion request failed requestId=${input.requestId}`, error);
      throw new CompanionRuntimeError('CONVERSATION_FAILED', 'Conversation request failed');
    } finally {
      clearTimeout(timer);
    }
  }

  cancel(conversationId: string, requestId: string): boolean {
    const entry = this.runtimes.get(conversationId);
    if (!entry?.active || entry.active.requestId !== requestId) return false;
    entry.session.abort();
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    const settling: Promise<void>[] = [];
    for (const entry of this.runtimes.values()) {
      if (entry.active) {
        entry.session.abort();
        settling.push(entry.active.settled);
      }
    }
    await Promise.race([
      Promise.allSettled(settling),
      new Promise<void>(resolve => setTimeout(resolve, 2_000)),
    ]);
    for (const entry of this.runtimes.values()) {
      entry.unsubscribe();
      entry.dispose();
    }
    this.runtimes.clear();
  }

  private async openRuntime(input: CompanionAskInput, profileKey: string): Promise<RuntimeEntry> {
    const turnContext: CompanionTurnContext = {};
    const opened = await this.factory.open({
      conversationId: input.conversationId,
      profileName: input.profileName,
      turnContext,
    });
    const entry: RuntimeEntry = {
      profileKey,
      session: opened.session,
      turnContext,
      unsubscribe: () => {},
      dispose: opened.dispose,
    };
    entry.unsubscribe = opened.session.subscribe((event: any) => this.handleSessionEvent(entry, event));
    this.runtimes.set(input.conversationId, entry);
    return entry;
  }

  private handleSessionEvent(entry: RuntimeEntry, event: any): void {
    const active = entry.active;
    if (!active) return;
    if (event.type === 'message_update') {
      const update = event.assistantMessageEvent;
      if (update?.type === 'thinking_delta') {
        active.think += update.delta;
        active.onEvent?.({ type: 'think', content: update.delta });
      } else if (update?.type === 'text_delta') {
        active.rawAnswer += update.delta;
        const visible = visibleSpeechAnswer(active.rawAnswer);
        const content = visible.slice(active.emittedAnswer.length);
        active.emittedAnswer = visible;
        if (content) active.onEvent?.({ type: 'chunk', content });
      }
    }
    if (event.type === 'agent_settled') {
      active.aborted = event.aborted === true;
      entry.active = undefined;
      active.resolveSettled();
    }
  }

  private assistantText(message: any): string {
    if (!message || message.role !== 'assistant') return '';
    if (typeof message.content === 'string') return message.content;
    return Array.isArray(message.content)
      ? message.content.filter((part: any) => part.type === 'text').map((part: any) => part.text ?? '').join('')
      : '';
  }
}
