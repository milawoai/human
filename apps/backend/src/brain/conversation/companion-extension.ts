import type { InlineExtension } from '@earendil-works/pi-coding-agent';
import { speechDisplayMessage, splitSpeechSummary } from '../speech/speech-summary';

export interface CompanionTurnContext {
  memoryText?: string;
  speechSummaryEnabled?: boolean;
  onSpeechSummary?: (summary: string | undefined) => void;
}

function assistantText(message: any): string {
  if (!message || message.role !== 'assistant') return '';
  if (typeof message.content === 'string') return message.content;
  return Array.isArray(message.content)
    ? message.content.filter((part: any) => part.type === 'text').map((part: any) => part.text ?? '').join('')
    : '';
}

export function createCompanionExtension(turn: CompanionTurnContext): InlineExtension {
  return {
    name: 'human-companion',
    hidden: true,
    factory: (api) => {
      api.on('context', (event) => {
        const memoryText = turn.memoryText?.trim();
        if (!memoryText) return;
        const messages = [...event.messages];
        const lastUser = messages.findLastIndex((message) => message.role === 'user');
        messages.splice(Math.max(0, lastUser), 0, {
          role: 'user',
          content: memoryText,
          timestamp: Date.now(),
        });
        return { messages };
      });
      api.on('message_end', (event) => {
        if (event.message.role !== 'assistant') return;
        const parsed = splitSpeechSummary(
          assistantText(event.message),
          turn.speechSummaryEnabled !== false,
        );
        turn.onSpeechSummary?.(parsed.summary);
        return { message: speechDisplayMessage(event.message) };
      });
    },
  };
}
