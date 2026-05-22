import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TOPIC } from 'neural-topics';
import { BrainCortexService } from '../src/brain/cortex/brain-cortex.service';
import { LlmService } from '../src/brain/language-center/llm.service';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';
import { ProviderAuthService } from '../src/brain/language-center/provider-auth.service';
import type { BusMessage, Capability } from '../src/neural/interfaces';

class CoreStub {
  registerInternalActor(_actor: unknown): boolean {
    return true;
  }
  registerCapabilities(_caps: Capability[]): void {}
  findSubscribers(_topic: string): { connectionId: string; actor: unknown }[] {
    return [{ connectionId: 'conn-1', actor: { actorId: 'test-subscriber' } }];
  }
}

class WsStub {
  public sent: Array<{ event: string; message: BusMessage }> = [];
  sendToConnection(_connectionId: string, event: string, message: BusMessage): boolean {
    this.sent.push({ event, message });
    return true;
  }
}

class HttpStub {
  registerCommandHandler(_handler: unknown): void {}
}

class MemoryStub {
  search(): any[] {
    return [];
  }
}

async function main() {
  const { fauxAssistantMessage, fauxText, registerFauxProvider } = await import(
    '@mariozechner/pi-ai'
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-rewrite-smoke-'));
  process.env.HOME = tmp;

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
  const wsStub = new WsStub();

  const cortex = new BrainCortexService(
    new CoreStub() as any,
    wsStub as any,
    new HttpStub() as any,
    llmService,
    modelConfigService,
    providerAuthService,
    new MemoryStub() as any,
  );

  assert.equal(cortex.canHandle(TOPIC.BRAIN_CORTEX_REWRITE_REQUESTED), true);

  const faux = registerFauxProvider({
    api: 'faux-api',
    provider: 'faux-provider',
    models: [{ id: 'faux-1', reasoning: false }],
  });
  faux.setResponses([fauxAssistantMessage([fauxText('请问今天功能何时上线？')])]);

  const result = await cortex.handleCommand({
    id: 'rewrite-test-1',
    kind: 'command',
    topic: TOPIC.BRAIN_CORTEX_REWRITE_REQUESTED,
    source: { actorId: 'body', runtime: 'electron', system: 'body' },
    timestamp: Date.now(),
    payload: {
      requestId: 'req-1',
      text: '那个我问下今天这个功能大概什么时候能上线啊',
    },
  });

  assert.equal(result.success, true);
  assert.equal(typeof result.data?.normalizedQuestion, 'string');
  assert.ok(result.data?.normalizedQuestion.length > 0);

  const completedEvent = wsStub.sent.find(
    (item) =>
      item.event === 'message' &&
      item.message.kind === 'event' &&
      item.message.topic === TOPIC.BRAIN_CORTEX_REWRITE_COMPLETED,
  );
  assert.ok(completedEvent);
  assert.equal((completedEvent?.message.payload as any)?.requestId, 'req-1');

  faux.unregister();
  console.log('brain-rewrite-smoke: OK');
}

void main();
