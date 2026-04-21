import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NeuralModule } from './neural/neural.module';
import { BrainModule } from './brain/brain.module';

@Module({
  imports: [NeuralModule, BrainModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
