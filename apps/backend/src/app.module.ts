import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NeuralModule } from './neural/neural.module';
import { BrainModule } from './brain/brain.module';
import { DatabaseModule } from './database/database.module';
import { MotorModule } from './motor/motor.module';
import { MotorToolRunnerModule } from './motor/motor-tool-runner/motor-tool-runner.module';
@Module({
  imports: [DatabaseModule, NeuralModule, BrainModule, MotorModule, MotorToolRunnerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
