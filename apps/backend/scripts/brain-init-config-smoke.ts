import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BrainInitService } from '../src/brain/init/brain-init.service';
import type { Capability } from '../src/neural/interfaces';

class CoreStub {
  registerInternalActor(_actor: unknown): boolean {
    return true;
  }

  registerCapabilities(_caps: Capability[]): void {}

  findSubscribers(_topic: string, _kind?: unknown): { connectionId: string; actor: unknown }[] {
    return [];
  }
}

class WsStub {
  sendToConnection(_connectionId: string, _event: string, _message: unknown): boolean {
    return true;
  }
}

class HttpStub {
  registerCommandHandler(_handler: unknown): void {}
}

async function main() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-init-smoke-'));
  process.env.HOME = tempHome;

  const service = new BrainInitService(
    new CoreStub() as any,
    new WsStub() as any,
    new HttpStub() as any,
  );

  await service.onModuleInit();

  const result = await service.handleCommand({
    id: 'init-smoke',
    kind: 'command',
    topic: 'brain.init.execute',
    source: {
      actorId: 'test',
      runtime: 'nest',
      system: 'brain',
    },
    timestamp: Date.now(),
    payload: {},
  });

  assert.equal(result.success, true);

  const configPath = path.join(tempHome, '.ai_secretary', 'config.json');
  const secretsExamplePath = path.join(tempHome, '.ai_secretary', 'secrets.env.example');
  assert.equal(fs.existsSync(configPath), true);
  assert.equal(fs.existsSync(secretsExamplePath), true);

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  assert.equal(config.version, 1);
  assert.ok(config.brain);
  assert.equal(config.brain.defaultProfile, '');
  assert.deepEqual(config.brain.profiles, {});
  console.log('brain-init-config-smoke: OK');
}

void main();
