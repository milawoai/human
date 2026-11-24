import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { LlmService } from '../language-center/llm.service';
import type { ProviderAuthService } from '../language-center/provider-auth.service';
import { ConversationIndexStore } from './conversation-index.store';
import { CompanionTurnContext, createCompanionExtension } from './companion-extension';

export const PI_CONVERSATION_OPTIONS = Symbol('PI_CONVERSATION_OPTIONS');

export interface PiConversationFactoryOptions {
  root?: string;
}

export interface OpenPiConversationInput {
  conversationId: string;
  profileName?: string;
  turnContext?: CompanionTurnContext;
}

const COMPANION_PROMPT = [
  '你是 Human 的桌面陪伴助手。',
  '自然、简洁地回答用户；不要假装拥有未提供的工具或系统权限。',
].join('\n');

const loadPi = (): Promise<typeof import('@earendil-works/pi-coding-agent')> =>
  new Function('return import("@earendil-works/pi-coding-agent")')();

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

@Injectable()
export class PiConversationFactory {
  private readonly root: string;

  constructor(
    private readonly index: ConversationIndexStore,
    private readonly llm: Pick<LlmService, 'resolveModel' | 'getModels'>,
    private readonly auth: Pick<ProviderAuthService, 'resolveApiKey'>,
    @Optional() @Inject(PI_CONVERSATION_OPTIONS) options?: PiConversationFactoryOptions,
  ) {
    this.root = options?.root
      ?? process.env.HUMAN_CONVERSATION_ROOT
      ?? path.join(os.homedir(), '.ai_secretary', 'conversations');
  }

  async open(input: OpenPiConversationInput) {
    const record = this.index.getInternalRecord(input.conversationId);
    if (!record) throw new Error(`Conversation not found: ${input.conversationId}`);
    if (record.status === 'unavailable') throw new Error(`Conversation unavailable: ${input.conversationId}`);

    const pi = await loadPi();
    const resolved = await this.llm.resolveModel(input.profileName);
    const safeProfile = resolved.profileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const cwd = path.join(this.root, 'companion-cwd');
    const agentDir = path.join(this.root, 'agent');
    const sessionDir = path.join(this.root, 'sessions');
    const runtimeDir = path.join(this.root, 'runtimes', input.conversationId, safeProfile);
    [cwd, agentDir, sessionDir, runtimeDir].forEach((directory) => fs.mkdirSync(directory, { recursive: true }));

    const runtime = await pi.ModelRuntime.create({
      authPath: path.join(runtimeDir, 'auth.json'),
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const models = await this.llm.getModels();
    const apiKey = await this.auth.resolveApiKey(resolved.profileName, resolved.profile);
    runtime.registerProvider(resolved.model.provider, {
      name: resolved.model.provider,
      baseUrl: resolved.model.baseUrl,
      apiKey,
      api: resolved.model.api,
      models: [providerModel(resolved.model)],
      streamSimple: (model, context, options) => models.streamSimple(model, context, options),
    });
    if (apiKey) await runtime.setRuntimeApiKey(resolved.model.provider, apiKey);

    const settingsManager = pi.SettingsManager.inMemory();
    const turnContext = input.turnContext ?? {};
    const resourceLoader = new pi.DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionFactories: [createCompanionExtension(turnContext)],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: COMPANION_PROMPT,
    });
    await resourceLoader.reload();

    const sessionManager = record.status === 'pending'
      ? pi.SessionManager.create(cwd, sessionDir, { id: input.conversationId })
      : pi.SessionManager.open(this.requireInternalSessionPath(record.piSessionPath, sessionDir), sessionDir, cwd);
    const { session } = await pi.createAgentSession({
      cwd,
      agentDir,
      modelRuntime: runtime,
      model: resolved.model,
      noTools: 'all',
      resourceLoader,
      sessionManager,
      settingsManager,
    });
    if (session.model?.provider !== resolved.model.provider || session.model?.id !== resolved.model.id) {
      await session.setModel(resolved.model, { persist: false });
    }
    this.index.touchOpened(input.conversationId);
    return {
      session,
      profileKey: resolved.profileName,
      dispose: () => session.dispose(),
    };
  }

  private requireInternalSessionPath(sessionPath: string | undefined, sessionDir: string): string {
    if (!sessionPath) throw new Error('Available conversation has no Pi session path');
    const resolved = path.resolve(sessionPath);
    const root = `${path.resolve(sessionDir)}${path.sep}`;
    if (!resolved.startsWith(root) || !fs.existsSync(resolved)) {
      throw new Error('Conversation Pi session path is missing or outside the managed directory');
    }
    return resolved;
  }
}
