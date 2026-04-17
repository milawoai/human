import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NeuralModule } from './neural/neural.module';

@Module({
  imports: [NeuralModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
