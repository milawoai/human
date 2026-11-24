/**
 * BrainModule — 脑系统总模块
 *
 * 包含 BrainInitService（系统初始化）等子模块。
 * Brain 作为内部 Actor 注册到 NeuralCore，无需 WS 连接。
 *
 * 依赖：
 * - NeuralCoreModule（@Global，自动可用）
 * - NeuralWsModule（推送事件给 WS 订阅者）
 * - NeuralHttpModule（注册自身为命令处理器）
 */
import { Global, Module } from '@nestjs/common';
import { NeuralModule } from '../neural/neural.module';
import { MotorToolRunnerModule } from '../motor/motor-tool-runner/motor-tool-runner.module';
import { BrainInitService } from './init/brain-init.service';
import { ToolConfigService } from './tool-config/tool-config.service';
import { BrainLanguageCenterModule } from './language-center/language-center.module';
import { BrainCortexService } from './cortex/brain-cortex.service';
import { BrainAgentService } from './agent/brain-agent.service';
import { AgentSessionStore } from './agent/agent-session.store';
import { MemoryModule } from './hippocampus/memory.module';
import { BrainSpeechService } from './speech/brain-speech.service';
import { ToolRoutingLogStore } from './basal-ganglia/tool-routing-log.store';
import { ToolRouterService } from './basal-ganglia/tool-router.service';
import { JobsModule } from '../motor/jobs/jobs.module';
import { PiWorkspaceWorkerService } from './agent/worker/pi-workspace-worker.service';
import { ConversationIndexStore } from './conversation/conversation-index.store';
import { PiConversationFactory } from './conversation/pi-conversation.factory';
import { CompanionRuntimeService } from './conversation/companion-runtime.service';
import { BrainConversationService } from './conversation/brain-conversation.service';


@Global()
@Module({
  imports: [NeuralModule, BrainLanguageCenterModule, MemoryModule, MotorToolRunnerModule, JobsModule],
  providers: [
    PiWorkspaceWorkerService,
    ConversationIndexStore,
    PiConversationFactory,
    CompanionRuntimeService,
    BrainConversationService,
    BrainInitService,
    BrainCortexService,
    BrainAgentService,
    CompanionRuntimeService,
    AgentSessionStore,
    ToolConfigService,
    BrainSpeechService,
    ToolRoutingLogStore,
    ToolRouterService,
  ],
  exports: [
    BrainInitService,
    BrainCortexService,
    BrainAgentService,
    ToolConfigService,
    ToolRoutingLogStore,
    ToolRouterService,
  ],
})
export class BrainModule {}
