import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Model, Api } from '@earendil-works/pi-ai';
import { LlmService } from '../src/brain/language-center/llm.service';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';
import { ProviderAuthService } from '../src/brain/language-center/provider-auth.service';
import { speechDisplayMessage, splitSpeechSummary } from '../src/brain/speech/speech-summary';

const loadPi = (): Promise<typeof import('@earendil-works/pi-coding-agent')> =>
  new Function('return import("@earendil-works/pi-coding-agent")')();
const loadAi = (): Promise<typeof import('@earendil-works/pi-ai')> =>
  new Function('return import("@earendil-works/pi-ai")')();

const COMPANION_PROMPT = [
  '你是 Human 的桌面陪伴助手。',
  '自然、简洁地回答用户；不要假装拥有未提供的工具或系统权限。',
].join('\n');

function providerModel(model: Model<Api>) {
  return {
    id: model.id,
    name: model.name,
    api: model.api,
    baseUrl: model.baseUrl,
    reasoning: model.reasoning,
    input: [...model.input],
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

function assistantText(message: any): string {
  if (!message || message.role !== 'assistant') return '';
  if (typeof message.content === 'string') return message.content;
  return Array.isArray(message.content)
    ? message.content.filter((part: any) => part.type === 'text').map((part: any) => part.text ?? '').join('')
    : '';
}

async function verifySessionDiscovery(
  SessionManager: typeof import('@earendil-works/pi-coding-agent').SessionManager,
  cwd: string,
  sessionDir: string,
  conversationId: string,
) {
  const sessionFile = SessionManager.findById(cwd, conversationId, sessionDir);
  assert.ok(sessionFile, 'persisted session must be discoverable by exact id');
  const listed = await SessionManager.list(cwd, sessionDir);
  assert.equal(listed.some(item => item.id === conversationId), true);
  assert.equal(SessionManager.continueRecent(cwd, sessionDir).getSessionId(), conversationId);

  const opened = SessionManager.open(sessionFile, sessionDir, cwd);
  const originalBranch = opened.getBranch();
  const firstMessage = originalBranch.find(entry => entry.type === 'message');
  const originalAssistant = [...originalBranch].reverse().find(
    entry => entry.type === 'message' && entry.message.role === 'assistant',
  );
  assert.ok(firstMessage && originalAssistant && originalAssistant.type === 'message');
  opened.branch(firstMessage.id);
  opened.appendMessage({
    ...originalAssistant.message,
    content: [{ type: 'text', text: 'alternate branch response' }],
    timestamp: Date.now(),
  } as any);
  const currentBranch = opened.getBranch();
  const transcript = currentBranch
    .filter((entry): entry is Extract<typeof entry, { type: 'message' }> => entry.type === 'message')
    .filter(entry => entry.message.role === 'user' || entry.message.role === 'assistant');
  assert.equal(transcript.some(entry => assistantText(entry.message).includes('alternate branch response')), true);
  assert.equal(currentBranch.length < opened.getEntries().length, true, 'raw entries include abandoned branches');

  const emptyId = randomUUID();
  const empty = SessionManager.create(cwd, sessionDir, { id: emptyId });
  assert.equal(existsSync(empty.getSessionFile() ?? ''), false);
  const rebuilt = SessionManager.create(cwd, sessionDir, { id: emptyId });
  assert.equal(rebuilt.getSessionId(), emptyId, 'pending empty conversation must retain its id after restart');
  assert.equal(existsSync(rebuilt.getSessionFile() ?? ''), false);
  console.log('PASS: create/open/find/list/current branch and empty-session id rebuild');
}

async function verifyExtensionsAndCompaction(
  pi: typeof import('@earendil-works/pi-coding-agent'),
  root: string,
) {
  const ai = await loadAi();
  const cwd = join(root, 'extension-cwd');
  const agentDir = join(root, 'extension-agent');
  const sessionDir = join(root, 'extension-sessions');
  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });

  const model = {
    id: 'fixture-chat', name: 'Fixture Chat', provider: 'human-fixture', api: 'openai-completions',
    baseUrl: 'http://unused', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  } as Model<Api>;
  const contexts: any[] = [];
  let capturedSummary = '';
  let responseNumber = 0;
  let failNextResponse = false;
  const runtime = await pi.ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'), modelsPath: null, allowModelNetwork: false, refreshOnCreate: false,
  });
  runtime.registerProvider(model.provider, {
    name: 'Human Fixture', apiKey: 'fixture-key', api: model.api,
    models: [providerModel(model)],
    streamSimple: (_model, context) => {
      contexts.push(structuredClone(context));
      if (failNextResponse) {
        failNextResponse = false;
        throw new Error('fixture compaction failure');
      }
      responseNumber++;
      const text = responseNumber === 1
        ? '可见回答。<human_speech_summary>{"text":"简短播报。"}</human_speech_summary>'
        : 'Conversation compacted into a fixture summary.';
      const stream = ai.createAssistantMessageEventStream();
      const message = {
        role: 'assistant', api: model.api, provider: model.provider, model: model.id,
        content: [{ type: 'text', text }], stopReason: 'stop', timestamp: Date.now(),
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      } as any;
      stream.push({ type: 'start', partial: message });
      stream.push({ type: 'done', reason: 'stop', message });
      return stream;
    },
  });
  const settingsManager = pi.SettingsManager.inMemory({
    compaction: { enabled: true, reserveTokens: 128, keepRecentTokens: 128 },
  });
  const turnMemory = 'HUMAN_REQUEST_MEMORY: 用户偏好简洁回答';
  const extension = {
    name: 'human-companion-test', hidden: true,
    factory: (api: import('@earendil-works/pi-coding-agent').ExtensionAPI) => {
      api.on('context', event => {
        const messages = [...event.messages];
        const lastUser = messages.findLastIndex(message => message.role === 'user');
        messages.splice(Math.max(0, lastUser), 0, {
          role: 'user', content: turnMemory, timestamp: Date.now(),
        });
        return { messages };
      });
      api.on('message_end', event => {
        if (event.message.role !== 'assistant') return;
        const parsed = splitSpeechSummary(assistantText(event.message), true);
        capturedSummary = parsed.summary ?? '';
        return { message: speechDisplayMessage(event.message) };
      });
    },
  };
  const resourceLoader = new pi.DefaultResourceLoader({
    cwd, agentDir, settingsManager, extensionFactories: [extension], noExtensions: true,
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: COMPANION_PROMPT,
  });
  await resourceLoader.reload();
  assert.equal(resourceLoader.getExtensions().extensions.length, 1, 'inline extension must survive disk extension suppression');
  assert.equal(resourceLoader.getExtensions().extensions[0].path, '<inline:human-companion-test>');

  const manager = pi.SessionManager.create(cwd, sessionDir, { id: randomUUID() });
  const { session } = await pi.createAgentSession({
    cwd, agentDir, modelRuntime: runtime, model, noTools: 'all', resourceLoader, sessionManager: manager,
    settingsManager,
  });
  const events: string[] = [];
  const unsubscribe = session.subscribe(event => events.push(event.type));
  try {
    await session.prompt('验证临时上下文和播报摘要');
    assert.equal(JSON.stringify(contexts[0]).includes(turnMemory), true, 'request context must reach provider');
    assert.equal(capturedSummary, '简短播报。');
    assert.equal(assistantText(session.state.messages.at(-1)).trim(), '可见回答。');
    const file = manager.getSessionFile();
    assert.ok(file && existsSync(file));
    assert.equal(readFileSync(file, 'utf8').includes(turnMemory), false, 'request-only memory must not persist');
    assert.equal(readFileSync(file, 'utf8').includes('human_speech_summary'), false, 'speech block must be stripped before persistence');

    await session.prompt(`第二轮长上下文：${'需要保留的会话事实。'.repeat(240)}`);
    const idsBeforeFailure = manager.getEntries().filter(entry => entry.type === 'message').map(entry => entry.id);
    failNextResponse = true;
    await assert.rejects(session.compact('This attempt must fail.'), /fixture compaction failure/);
    assert.deepEqual(
      manager.getEntries().filter(entry => entry.type === 'message').map(entry => entry.id),
      idsBeforeFailure,
      'failed compaction must leave original messages intact',
    );
    await session.prompt('压缩失败后继续会话');
    const rawBefore = manager.getEntries();
    const messageIdsBefore = rawBefore.filter(entry => entry.type === 'message').map(entry => entry.id);
    const compacted = await session.compact('Keep a short fixture summary.');
    assert.ok(compacted.summary.trim());
    assert.equal(events.includes('compaction_start'), true);
    assert.equal(events.includes('compaction_end'), true);
    const rawAfter = manager.getEntries();
    assert.equal(rawAfter.some(entry => entry.type === 'compaction'), true);
    assert.deepEqual(
      rawAfter.filter(entry => entry.type === 'message').map(entry => entry.id),
      messageIdsBefore,
      'compaction must append, not delete original messages',
    );
    console.log('PASS: request-only context, pre-persistence speech cleanup and append-only compaction');
  } finally {
    unsubscribe();
    session.dispose();
  }
}

async function registerResolvedModel(
  runtime: import('@earendil-works/pi-coding-agent').ModelRuntime,
  model: Model<Api>,
) {
  if (!runtime.getProvider(model.provider) || !runtime.getModel(model.provider, model.id)) {
    runtime.registerProvider(model.provider, {
      name: model.provider,
      baseUrl: model.baseUrl,
      api: model.api,
      models: [providerModel(model)],
    });
  }
}

async function main() {
  const root = join(tmpdir(), `human-pi-conversation-${process.pid}-${Date.now()}`);
  const agentDir = join(root, 'agent');
  const authPath = join(agentDir, 'auth.json');
  const sessionDir = join(root, 'sessions');
  const companionCwd = join(root, 'companion-cwd');
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(companionCwd, { recursive: true });

  try {
    const {
      createAgentSession,
      DefaultResourceLoader,
      ModelRuntime,
      SessionManager,
      SettingsManager,
    } = await loadPi();

    const runtime = await ModelRuntime.create({
      authPath,
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd: companionCwd,
      agentDir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: COMPANION_PROMPT,
    });
    await resourceLoader.reload();

    assert.equal(resourceLoader.getExtensions().extensions.length, 0);
    assert.equal(resourceLoader.getSkills().skills.length, 0);
    assert.equal(resourceLoader.getPrompts().prompts.length, 0);
    assert.equal(resourceLoader.getThemes().themes.length, 0);
    assert.equal(resourceLoader.getAgentsFiles().agentsFiles.length, 0);
    assert.equal(resourceLoader.getSystemPrompt(), COMPANION_PROMPT);
    assert.equal(resolve(authPath).startsWith(resolve(root)), true);
    console.log('PASS: isolated Human paths and companion resources (no ~/.pi discovery)');

    const modelConfig = new ModelConfigService();
    const auth = new ProviderAuthService();
    const llm = new LlmService(modelConfig, auth);
    const resolvedModel = await llm.resolveModel();
    await registerResolvedModel(runtime, resolvedModel.model);
    const apiKey = await auth.resolveApiKey(resolvedModel.profileName, resolvedModel.profile);
    if (apiKey) await runtime.setRuntimeApiKey(resolvedModel.model.provider, apiKey);
    assert.equal(runtime.getProvider(resolvedModel.model.provider) !== undefined, true);
    assert.equal(runtime.getModel(resolvedModel.model.provider, resolvedModel.model.id) !== undefined, true);
    assert.equal(
      apiKey ? runtime.getProviderAuthStatus(resolvedModel.model.provider).configured : true,
      true,
    );
    console.log(`PASS: current Human profile resolved (${resolvedModel.profileName}/${resolvedModel.model.id})`);

    const conversationId = randomUUID();
    const sessionManager = SessionManager.create(companionCwd, sessionDir, { id: conversationId });
    const { session } = await createAgentSession({
      cwd: companionCwd,
      agentDir,
      modelRuntime: runtime,
      model: resolvedModel.model,
      noTools: 'all',
      resourceLoader,
      sessionManager,
      settingsManager,
    });
    assert.deepEqual(session.getActiveToolNames(), []);
    assert.deepEqual(session.getCallableToolNames(), []);
    assert.equal(session.systemPrompt.startsWith(COMPANION_PROMPT), true);
    assert.equal(session.systemPrompt.includes(`<cwd>\n${companionCwd}\n</cwd>`), true);
    assert.equal(session.model?.provider, resolvedModel.model.provider);
    assert.equal(session.model?.id, resolvedModel.model.id);
    assert.equal(existsSync(sessionManager.getSessionFile() ?? ''), false, 'empty session must remain lazy');

    const events: string[] = [];
    const unsubscribe = session.subscribe(event => events.push(event.type));
    try {
      await session.prompt('只回复：HUMAN_PI_CONVERSATION_OK');
      assert.equal(session.isIdle, true);
      assert.equal(events.includes('message_update'), true, 'current profile must stream response events');
      assert.equal(events.includes('agent_settled'), true, 'run must reach authoritative settled state');
      assert.equal(existsSync(sessionManager.getSessionFile() ?? ''), true, 'first turn must persist JSONL');
      const assistant = [...session.state.messages].reverse().find(message => message.role === 'assistant');
      assert.ok(assistant, 'current profile must produce an assistant message');
    } finally {
      unsubscribe();
      session.dispose();
    }
    console.log('PASS: current Human model streams through isolated Pi AgentSession');
    await verifySessionDiscovery(SessionManager, companionCwd, sessionDir, conversationId);
    await verifyExtensionsAndCompaction(
      { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } as any,
      root,
    );
    console.log('SKIP: OAuth profile is not active; API shape retained for a later OAuth fixture');
    console.log('Pi conversation SDK smoke: TASKS 1-6 PASS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
