import { WorkerFixture } from '../worker-fixture';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RuntimeModule } from '../../runtime.module';
import { prepareOwner } from '../../bootstrap';
import { NeuralHttpModule } from '../../../neural/neural-http/neural-http.module';
import { NeuralCoreService } from '../../../neural/neural-core/neural-core.service';
@Controller('fixture')
class WorkerStatus {
  constructor(private readonly worker: WorkerFixture) {}
  @Get('worker') status() { return { pid: this.worker.pid }; }
}
@Module({ imports: [RuntimeModule, NeuralHttpModule], providers: [WorkerFixture], controllers: [WorkerStatus] })
class DesktopFixture {}
async function main() {
  const install = await prepareOwner();
  const app = await NestFactory.create(DesktopFixture, { logger: false });
  await install(app);
  const core = app.get(NeuralCoreService);
  for (const [id, system, topic] of [['brain-main', 'brain', 'brain.agent.run'], ['motor-tool-runner', 'motor', 'motor.tool.list']] as const) {
    const actor = { actorId: id, runtime: 'nest' as const, system };
    core.registerInternalActor(actor);
    core.registerCapabilities([{ id: topic, actor, topic, mode: 'once', kinds: ['command'], enabled: true, online: true }]);
  }
  await app.listen(Number(process.env.PORT), '127.0.0.1');
}
void main().catch(() => { process.exitCode = 1; });
