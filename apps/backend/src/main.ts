import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const logger = new Logger('Bootstrap');

  // 全局 ValidationPipe，启用 transform 使 DTO 类型转换生效
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
    }),
  );

  // 启用 CORS
  app.enableCors();

  const port = process.env.PORT ?? 12002;
  await app.listen(port);
  logger.log(`NestJS 服务已启动，监听端口: ${port}`);
}
void bootstrap();
