/**
 * Motor Tool Runner — Nest Module
 *
 * 管理 Motor Tool Runner 的所有组件依赖
 */
import { Module } from '@nestjs/common';
import { MotorToolRunnerService } from './motor-tool-runner.service';
import { ToolRegistry } from './core/tool-registry';
import { ToolExecutor } from './core/tool-executor';
import { ToolAdapterService } from './core/tool-adapter.service';
import { MotorGateway } from './neural/motor-gateway';
import { ToolHandler } from './neural/tool-handler';
import { TtsCacheController } from './tts-cache.controller';
import { NeuralModule } from '../../neural/neural.module';
import { PiCodingProvider } from './providers/pi-coding-provider';
import { SystemSessionProvider } from './providers/system-session-provider';

@Module({
  imports: [NeuralModule],
  controllers: [TtsCacheController],
  providers: [
    MotorToolRunnerService,
    ToolRegistry,
    ToolExecutor,
    ToolAdapterService,
    MotorGateway,
    ToolHandler,
    PiCodingProvider,
    SystemSessionProvider,
  ],
  exports: [MotorToolRunnerService, ToolRegistry, ToolExecutor, ToolAdapterService],
})
export class MotorToolRunnerModule {}
