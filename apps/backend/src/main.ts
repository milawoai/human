import { prepareOwner } from './runtime/bootstrap';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

async function bootstrap() {
  const installOwner = await prepareOwner();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  await installOwner(app);
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
  await app.listen(port, '127.0.0.1');
  logger.log(`NestJS 服务已启动，监听端口: ${port}`);
}
void bootstrap().catch(() => { console.error('[Runtime] Backend startup failed'); process.exitCode = 1; });
