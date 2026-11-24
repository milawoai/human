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

  await verifyConcurrentFirstOpenIsRejected();
  await verifyPromptFailureReleasesConversation();
  await verifyUnavailableConversationHasStableCode();
}

async function verifyConcurrentFirstOpenIsRejected(): Promise<void> {
  let releaseOpen!: () => void;
  let openCalls = 0;
  const listeners = new Set<(event: any) => void>();
  const session: any = {
    state: { messages: [assistant('一次回答')] },
    sessionManager: { getSessionFile: () => '/managed/first-open.jsonl' },
    subscribe(listener: (event: any) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async prompt() { listeners.forEach(listener => listener({ type: 'agent_settled', aborted: false })); },
    abort() {},
    dispose() {},
  };
  const factory: any = {
    resolveProfileKey: async () => 'default',
    async open() {
      openCalls += 1;
      await new Promise<void>(resolve => { releaseOpen = resolve; });
      return { session, dispose: () => session.dispose() };
    },
  };
  const index: any = { get: () => ({ status: 'pending' }), markAvailable() {} };
  const runtime = new CompanionRuntimeService(factory, index);
  const first = runtime.ask({ conversationId: 'first-open', requestId: 'first', question: 'first' });
  await new Promise(resolve => setImmediate(resolve));
  const second = runtime.ask({ conversationId: 'first-open', requestId: 'second', question: 'second' });
  await assert.rejects(second, (error: any) => error.code === 'CONVERSATION_BUSY');
  assert.strictEqual(openCalls, 1);
  releaseOpen();
  await first;
  await runtime.onModuleDestroy();
  console.log('PASS: concurrent first question reserves the conversation before Pi opens');
}

async function verifyPromptFailureReleasesConversation(): Promise<void> {
  let promptCalls = 0;
  const listeners = new Set<(event: any) => void>();
  const session: any = {
    state: { messages: [assistant('重试成功')] },
    sessionManager: { getSessionFile: () => '/managed/retry.jsonl' },
    subscribe(listener: (event: any) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    async prompt() {
      promptCalls += 1;
      if (promptCalls === 1) throw new Error('model unavailable before run');
      listeners.forEach(listener => listener({ type: 'agent_settled', aborted: false }));
    },
    abort() {},
    dispose() {},
  };
  const factory: any = {
    resolveProfileKey: async () => 'default',
    open: async () => ({ session, dispose: () => session.dispose() }),
  };
  const index: any = { get: () => ({ status: 'pending' }), markAvailable() {} };
  const runtime = new CompanionRuntimeService(factory, index);
  await assert.rejects(
    runtime.ask({ conversationId: 'prompt-failure', requestId: 'failed', question: 'first' }),
    (error: any) => error.code === 'CONVERSATION_FAILED',
  );
  const retried = await runtime.ask({ conversationId: 'prompt-failure', requestId: 'retry', question: 'retry' });
  assert.strictEqual(retried.answer, '重试成功');
  await runtime.onModuleDestroy();
  console.log('PASS: prompt failure releases the conversation for a later request');
}

async function verifyUnavailableConversationHasStableCode(): Promise<void> {
  let factoryOpenCalls = 0;
  const runtime = new CompanionRuntimeService({
    resolveProfileKey: async () => 'default',
    async open() { factoryOpenCalls += 1; throw new Error('must not open unavailable session'); },
  } as any, { get: () => ({ status: 'unavailable' }) } as any);
  await assert.rejects(
    runtime.ask({ conversationId: 'unavailable', requestId: 'request', question: 'hello' }),
    (error: any) => error.code === 'CONVERSATION_UNAVAILABLE',
  );
  assert.strictEqual(factoryOpenCalls, 0);
  await runtime.onModuleDestroy();
  console.log('PASS: unavailable conversation is rejected with a stable code');
}
