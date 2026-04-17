/**
 * NeuralHttpModule — HTTP 接口模块
 */
import { Module } from '@nestjs/common';
import { NeuralCoreModule } from '../neural-core/neural-core.module';
import { NeuralWsModule } from '../neural-ws/neural-ws.module';
import { NeuralHttpController } from './neural-http.controller';

@Module({
  imports: [NeuralCoreModule, NeuralWsModule],
  controllers: [NeuralHttpController],
})
export class NeuralHttpModule {}
