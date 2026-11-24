import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Model, Api } from '@earendil-works/pi-ai';
import { LlmService } from '../src/brain/language-center/llm.service';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';
import { ProviderAuthService } from '../src/brain/language-center/provider-auth.service';

const loadPi = (): Promise<typeof import('@earendil-works/pi-coding-agent')> =>
  new Function('return import("@earendil-works/pi-coding-agent")')();

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
    console.log('SKIP: OAuth profile is not active; API shape retained for a later OAuth fixture');
    console.log('Pi conversation SDK smoke: TASKS 1-3 PASS');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
