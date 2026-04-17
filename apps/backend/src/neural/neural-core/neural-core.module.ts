/**
 * NeuralCoreModule — Neural Core 核心服务模块
 */
import { Global, Module } from '@nestjs/common';
import { NeuralCoreService } from './neural-core.service';

@Global()
@Module({
  providers: [NeuralCoreService],
  exports: [NeuralCoreService],
})
export class NeuralCoreModule {}
