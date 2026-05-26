import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BrainInitService } from '../src/brain/init/brain-init.service';
import { ToolConfigService } from '../src/brain/tool-config/tool-config.service';
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
    new ToolConfigService(),
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
  const profilesPath = path.join(tempHome, '.ai_secretary', 'profiles.json');
  assert.equal(fs.existsSync(configPath), true);
  assert.equal(fs.existsSync(secretsExamplePath), true);
  assert.equal(fs.existsSync(profilesPath), true);

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  assert.equal(config.version, 1);
  assert.ok(config.brain);
  assert.equal(config.brain.defaultProfile, '');
  assert.equal(config.brain.profiles, undefined);

  const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));
  assert.equal(profiles.version, 1);
  assert.ok(profiles.profiles['kimi-coding']);
  console.log('brain-init-config-smoke: OK');
}

void main();
