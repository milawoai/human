import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NeuralCoreService } from '../../../neural/neural-core/neural-core.service';
import { NeuralHttpService } from '../../../neural/neural-http/neural-http.service';
import { NeuralWsGateway } from '../../../neural/neural-ws/neural-ws.gateway';
import { LlmService } from '../../language-center/llm.service';
import { ModelConfigService } from '../../language-center/model-config.service';
import { ProviderAuthService } from '../../language-center/provider-auth.service';
import { BrainCortexService } from '../../cortex/brain-cortex.service';
import { MemoryService } from '../../hippocampus/memory.service';
import { BrainSpeechService } from '../../speech/brain-speech.service';
import { CONVERSATION_INDEX_DB_PATH, ConversationIndexStore } from '../conversation-index.store';
import { PI_CONVERSATION_OPTIONS, PiConversationFactory } from '../pi-conversation.factory';
import { CompanionRuntimeService } from '../companion-runtime.service';
import { BrainConversationService } from '../brain-conversation.service';

@Module({})
class ConversationDiModule {}

/**
 * 按 BrainModule 的登记方式，让会话相关 provider 走一遍真实的 Nest 依赖注入。
 * 其余用例都手工 new 服务，看不到坏掉的注入令牌，这类错误只在后端启动时才暴露。
 */
export async function runConversationDiCases(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'human-conversation-di-'));
  const neural = { registerInternalActor() {}, registerCapabilities() {}, registerCommandHandler() {} };
  try {
    const app = await NestFactory.createApplicationContext({
      module: ConversationDiModule,
      providers: [
        { provide: CONVERSATION_INDEX_DB_PATH, useValue: path.join(root, 'session.db') },
        { provide: PI_CONVERSATION_OPTIONS, useValue: { root } },
        { provide: NeuralCoreService, useValue: neural },
        { provide: NeuralHttpService, useValue: neural },
        { provide: NeuralWsGateway, useValue: {} },
        { provide: LlmService, useValue: {} },
        { provide: ModelConfigService, useValue: {} },
        { provide: ProviderAuthService, useValue: {} },
        { provide: MemoryService, useValue: {} },
        { provide: BrainSpeechService, useValue: {} },
        ConversationIndexStore,
        PiConversationFactory,
        CompanionRuntimeService,
        BrainConversationService,
        BrainCortexService,
      ],
    }, { logger: false, abortOnError: false });
    try {
      const index = app.get(ConversationIndexStore);
      const factory = app.get(PiConversationFactory);
      const runtime = app.get(CompanionRuntimeService);
      const cortex = app.get(BrainCortexService);
      assert.ok(cortex instanceof BrainCortexService);
      // 忙碌判断依赖单例：Cortex 与容器必须拿到同一个运行时和同一份索引
      assert.strictEqual((cortex as any).companionRuntime, runtime);
      assert.strictEqual((runtime as any).factory, factory);
      assert.strictEqual((runtime as any).index, index);
      assert.strictEqual((factory as any).index, index);
      assert.strictEqual((factory as any).root, root);
      assert.ok(app.get(BrainConversationService) instanceof BrainConversationService);
    } finally {
      await app.close();
    }
    console.log('PASS: conversation providers assemble through Nest dependency injection');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
