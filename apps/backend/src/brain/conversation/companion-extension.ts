import type { InlineExtension } from '@earendil-works/pi-coding-agent';
import { speechDisplayMessage, speechSystemPrompt, splitSpeechSummary } from '../speech/speech-summary';

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
        const speechPrompt = turn.speechSummaryEnabled === true
          ? speechSystemPrompt('', true).trim()
          : undefined;
        if (!memoryText && !speechPrompt) return;
        const messages = [...event.messages];
        const lastUser = messages.findLastIndex((message) => message.role === 'user');
        const inserts: any[] = [];
        if (speechPrompt) inserts.push({ role: 'system', content: speechPrompt, timestamp: Date.now() });
        if (memoryText) inserts.push({ role: 'user', content: memoryText, timestamp: Date.now() });
        messages.splice(Math.max(0, lastUser), 0, ...inserts);
        return { messages };
      });
      api.on('message_end', (event) => {
        if (event.message.role !== 'assistant') return;
        const parsed = splitSpeechSummary(
          assistantText(event.message),
          turn.speechSummaryEnabled === true,
        );
        turn.onSpeechSummary?.(parsed.summary);
        return { message: speechDisplayMessage(event.message) };
      });
    },
  };
}
