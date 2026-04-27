/**
 * Motor Tool Runner — Nest Module
 *
 * 管理 Motor Tool Runner 的所有组件依赖
 */
import { Module } from '@nestjs/common';
import { MotorToolRunnerService } from './motor-tool-runner.service';
import { ToolRegistry } from './core/tool-registry';
import { ToolExecutor } from './core/tool-executor';
import { MotorGateway } from './neural/motor-gateway';
import { ToolHandler } from './neural/tool-handler';
import { NeuralModule } from '../../neural/neural.module';

@Module({
  imports: [NeuralModule],
  providers: [
    MotorToolRunnerService,
    ToolRegistry,
    ToolExecutor,
    MotorGateway,
    ToolHandler,
  ],
  exports: [MotorToolRunnerService, ToolRegistry, ToolExecutor],
})
export class MotorToolRunnerModule {}
