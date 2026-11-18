import { WorkerFixture } from './worker-fixture';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RuntimeModule } from '../runtime.module';
import { prepareOwner } from '../bootstrap';
@Module({ imports: [RuntimeModule], providers: [WorkerFixture] })
class FixtureModule {}
async function main() {
  const install = await prepareOwner();
  const app = await NestFactory.create(FixtureModule, { logger: false });
  await install(app);
  await app.listen(0, '127.0.0.1');
  console.log(`FIXTURE_PORT=${app.getHttpServer().address().port}`);
}
void main().catch(() => { process.exitCode = 1; });
