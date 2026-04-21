/**
 * NeuralModule — Neural Core 总模块
 *
 * 统一导出 neural-core / neural-ws / neural-http 三个子模块
 */
import { Module } from '@nestjs/common';
import { NeuralCoreModule } from './neural-core/neural-core.module';
import { NeuralHttpModule } from './neural-http/neural-http.module';
import { NeuralWsModule } from './neural-ws/neural-ws.module';

@Module({
  imports: [
    NeuralCoreModule,
    NeuralWsModule,
    NeuralHttpModule,
  ],
  exports: [NeuralCoreModule, NeuralWsModule, NeuralHttpModule],
})
export class NeuralModule {}
