import type { LlmResolvedModel } from '../src/brain/language-center/llm.service';
import type { AssistantMessage } from '@earendil-works/pi-ai';

export async function fixtureJobLlm(onRequest?: () => void) {
  const ai = await new Function('return import("@earendil-works/pi-ai")')() as typeof import('@earendil-works/pi-ai');
  let requests = 0;
  const pendingStops = new Set<() => void>();
  const model: LlmResolvedModel = { profileName: 'fixture', profile: { provider: 'fixture' }, model: {
    id: 'fixture', name: 'fixture', api: 'openai-completions', provider: 'fixture', baseUrl: 'http://unused.invalid',
    input: ['text'], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 4096, maxTokens: 1024,
  } };
  return { model, requests: () => requests, release: () => { for (const stop of pendingStops) stop(); pendingStops.clear(); }, resolveModel: async () => model,
    streamSimple: async (_model: unknown, context: { messages: unknown[] }, options?: { signal?: AbortSignal }) => {
      requests++; onRequest?.();
      const stream = ai.createAssistantMessageEventStream();
      const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
      const base = { role: 'assistant' as const, api: model.model.api, provider: 'fixture', model: 'fixture', usage, timestamp: Date.now() };
      const transcript = JSON.stringify(context.messages);
      if (transcript.includes('WAIT_FOR_CANCEL') || transcript.includes('UNCOOPERATIVE_WAIT')) {
        const end = () => { const message: AssistantMessage = { ...base, content: [], stopReason: 'aborted' };
          stream.push({ type: 'error', reason: 'aborted', error: message }); };
        if (transcript.includes('UNCOOPERATIVE_WAIT')) pendingStops.add(end);
        else if (options?.signal?.aborted) end(); else options?.signal?.addEventListener('abort', end, { once: true });
        return stream;
      }
      const hasResult = transcript.includes('FRONTEND_PING') || context.messages.some(m => (m as { role?: string }).role === 'toolResult');
      const message: AssistantMessage = { ...base, stopReason: hasResult ? 'stop' : 'toolUse', content: hasResult
        ? [{ type: 'text', text: 'Inspected public.txt; public fixture verified.' }]
        : [{ type: 'toolCall', id: 'fixture-read', name: 'read', arguments: { path: 'public.txt' } }] };
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: hasResult ? 'stop' : 'toolUse', message });
      return stream;
    },
  };
}
