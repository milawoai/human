import * as assert from 'node:assert';
import { CompanionRuntimeService } from '../companion-runtime.service';

function assistant(text: string) {
  return {
    role: 'assistant', content: [{ type: 'text', text }], stopReason: 'stop', timestamp: Date.now(),
  };
}

export async function runCompanionRuntimeCases(): Promise<void> {
  let release: (() => void) | undefined;
  let promptCount = 0;
  let aborted = false;
  const listeners = new Set<(event: any) => void>();
  const session: any = {
    state: { messages: [] },
    sessionManager: { getSessionFile: () => '/managed/session.jsonl' },
    subscribe(listener: (event: any) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async prompt() {
      promptCount += 1;
      if (promptCount === 2) await new Promise<void>((resolve) => { release = resolve; });
      const final = assistant('可见回答。');
      this.state.messages.push(final);
      listeners.forEach(listener => listener({
        type: 'message_update', message: final,
        assistantMessageEvent: { type: 'thinking_delta', delta: '思考', contentIndex: 0, partial: final },
      }));
      listeners.forEach(listener => listener({
        type: 'message_update', message: final,
        assistantMessageEvent: { type: 'text_delta', delta: '可见回答。<human_speech_summary>', contentIndex: 0, partial: final },
      }));
      listeners.forEach(listener => listener({ type: 'agent_settled', aborted }));
    },
    abort() { aborted = true; release?.(); },
    dispose() {},
  };
  let turnContext: Record<string, any> = {};
  const factory: any = {
    resolveProfileKey: async (profileName?: string) => profileName ?? 'default',
    open: async (input: any) => {
      turnContext = input.turnContext;
      return { session, profileKey: input.profileName ?? 'default', dispose: () => session.dispose() };
    },
  };
  const index: any = {
    get: () => ({ conversationId: 'conversation-1', status: 'pending' }),
    markAvailableCalls: 0,
    markAvailable() { this.markAvailableCalls += 1; },
  };
  const runtime = new CompanionRuntimeService(factory, index);
  const events: any[] = [];

  const first = await runtime.ask({
    conversationId: 'conversation-1', requestId: 'request-1', question: '你好', memoryText: '临时记忆',
  }, event => events.push(event));
  assert.strictEqual(first.answer, '可见回答。');
  assert.strictEqual(events.some(event => event.type === 'think' && event.content === '思考'), true);
  assert.strictEqual(events.some(event => String(event.content).includes('human_speech_summary')), false);
  assert.strictEqual(turnContext.memoryText, '临时记忆');
  assert.strictEqual(index.markAvailableCalls, 1);

  const active = runtime.ask({ conversationId: 'conversation-1', requestId: 'request-2', question: '等待' });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(
    runtime.ask({ conversationId: 'conversation-1', requestId: 'request-3', question: '冲突' }),
    (error: any) => error.code === 'CONVERSATION_BUSY',
  );
  assert.strictEqual(runtime.cancel('conversation-1', 'request-2'), true);
  await assert.rejects(active, (error: any) => error.code === 'CONVERSATION_CANCELLED');
  assert.strictEqual(aborted, true);
  await runtime.onModuleDestroy();
  console.log('PASS: companion runtime event mapping, busy guard, cancellation and settlement');
}
