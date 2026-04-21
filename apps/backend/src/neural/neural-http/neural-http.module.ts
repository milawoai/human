/**
 * NeuralHttpModule — HTTP 接口模块
 */
import { Module } from '@nestjs/common';
import { NeuralCoreModule } from '../neural-core/neural-core.module';
import { NeuralWsModule } from '../neural-ws/neural-ws.module';
import { NeuralHttpController } from './neural-http.controller';
import { NeuralHttpService } from './neural-http.service';

@Module({
  imports: [NeuralCoreModule, NeuralWsModule],
  controllers: [NeuralHttpController],
  providers: [NeuralHttpService],
  exports: [NeuralHttpService],
})
export class NeuralHttpModule {}
