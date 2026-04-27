import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NeuralModule } from './neural/neural.module';
import { BrainModule } from './brain/brain.module';
import { MotorToolRunnerModule } from './motor/motor-tool-runner/motor-tool-runner.module';

@Module({
  imports: [NeuralModule, BrainModule, MotorToolRunnerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
