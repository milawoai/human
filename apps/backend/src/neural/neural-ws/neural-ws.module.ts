/**
 * NeuralWsModule — WebSocket 模块
 */
import { Module } from '@nestjs/common';
import { NeuralCoreModule } from '../neural-core/neural-core.module';
import { NeuralWsGateway } from './neural-ws.gateway';

@Module({
  imports: [NeuralCoreModule],
  providers: [NeuralWsGateway],
  exports: [NeuralWsGateway],
})
export class NeuralWsModule {}
