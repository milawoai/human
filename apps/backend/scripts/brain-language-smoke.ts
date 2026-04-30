import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TOPIC } from 'neural-topics';
import { BrainCortexService } from '../src/brain/cortex/brain-cortex.service';
import { LlmService } from '../src/brain/language-center/llm.service';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';
import { PiModelRegistryService } from '../src/brain/language-center/pi-model-registry.service';
import { ProviderAuthService } from '../src/brain/language-center/provider-auth.service';
import type { BusMessage, Capability } from '../src/neural/interfaces';

class CoreStub {
  registerInternalActor(_actor: unknown): boolean {
    return true;
  }
  registerCapabilities(_caps: Capability[]): void {}
  findSubscribers(_topic: string): { connectionId: string; actor: unknown }[] {
    return [];
  }
}

class WsStub {
  sendToConnection(_connectionId: string, _event: string, _message: BusMessage): boolean {
    return true;
  }
}

class HttpStub {
  registerCommandHandler(_handler: unknown): void {}
}

async function main() {
  const { fauxAssistantMessage, fauxText, registerFauxProvider } = await import(
    '@mariozechner/pi-ai'
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-smoke-'));
  process.env.HOME = tmp;
  process.env.ZAI_API_KEY = 'dummy-zai-key';

  const secretaryDir = path.join(tmp, '.ai_secretary');
  fs.mkdirSync(secretaryDir, { recursive: true });
  fs.writeFileSync(
    path.join(secretaryDir, 'config.json'),
    JSON.stringify(
      {
        version: 1,
        brain: {
          defaultProfile: 'faux-default',
          profiles: {
            'faux-default': {
              provider: 'faux-provider',
              model: 'faux-1',
              api: 'faux-api',
              baseUrl: 'http://localhost:0',
            },
            'zai-glm': {
              provider: 'zai',
              model: 'glm-5.1',
              api: 'openai-completions',
              baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
              apiKeyEnv: 'ZAI_API_KEY',
              reasoning: true,
              contextWindow: 204800,
              maxTokens: 131072,
            },
          },
        },
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );

  const modelConfigService = new ModelConfigService();
  const providerAuthService = new ProviderAuthService();
  const llmService = new LlmService(modelConfigService, providerAuthService);
  const registryService = new PiModelRegistryService(modelConfigService);

  const config = modelConfigService.getConfig({ strictEnv: true });
  assert.equal(config.brain.defaultProfile, 'faux-default');
  assert.ok(config.brain.profiles['zai-glm']);

  const preview = registryService.previewSync();
  assert.equal(preview.changed, true);
  assert.ok(preview.changes.some((c) => c.provider === 'zai' && c.modelId === 'glm-5.1'));

  const faux = registerFauxProvider({
    api: 'faux-api',
    provider: 'faux-provider',
    models: [{ id: 'faux-1', reasoning: false }],
  });

  faux.setResponses([fauxAssistantMessage([fauxText('hello-complete')])]);
  const completed = await llmService.complete({
    context: {
      messages: [{ role: 'user', content: 'ping', timestamp: Date.now() }],
    },
  });
  assert.ok(completed.content.some((c) => c.type === 'text' && c.text.includes('hello-complete')));

  faux.setResponses([fauxAssistantMessage([fauxText('hello-stream')])]);
  const stream = await llmService.stream({
    context: {
      messages: [{ role: 'user', content: 'stream ping', timestamp: Date.now() }],
    },
  });
  let hasDone = false;
  for await (const event of stream) {
    if (event.type === 'done') hasDone = true;
  }
  assert.equal(hasDone, true);

  const cortex = new BrainCortexService(
    new CoreStub() as any,
    new WsStub() as any,
    new HttpStub() as any,
    llmService,
    modelConfigService,
    providerAuthService,
  );
  assert.equal(cortex.canHandle(TOPIC.BRAIN_CORTEX_CHAT_COMPLETE), true);
  assert.equal(cortex.canHandle(TOPIC.BRAIN_LANGUAGE_MODELS_LIST), true);

  const listResult = await cortex.handleCommand({
    id: 'test-1',
    kind: 'query',
    topic: TOPIC.BRAIN_LANGUAGE_MODELS_LIST,
    source: { actorId: 'test', runtime: 'nest', system: 'brain' },
    timestamp: Date.now(),
    payload: {},
  });
  assert.equal(listResult.success, true);
  assert.ok(Array.isArray(listResult.data));

  faux.unregister();
  console.log('brain-language-smoke: OK');
}

void main();
