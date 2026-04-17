import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const logger = new Logger('Bootstrap');

  // 启用 CORS
  app.enableCors();

  const port = process.env.PORT ?? 12002;
  await app.listen(port);
  logger.log(`NestJS 服务已启动，监听端口: ${port}`);
}
void bootstrap();
