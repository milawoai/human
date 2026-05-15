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
import { Module } from '@nestjs/common';
import { NeuralModule } from '../neural/neural.module';
import { BrainInitService } from './init/brain-init.service';
import { BrainLanguageCenterModule } from './language-center/language-center.module';
import { BrainCortexService } from './cortex/brain-cortex.service';
import { BrainAgentService } from './agent/brain-agent.service';
import { AgentSessionStore } from './agent/agent-session.store';
import { MemoryModule } from './hippocampus/memory.module';

@Module({
  imports: [NeuralModule, BrainLanguageCenterModule, MemoryModule],
  providers: [BrainInitService, BrainCortexService, BrainAgentService, AgentSessionStore],
  exports: [BrainInitService, BrainCortexService, BrainAgentService],
})
export class BrainModule {}
