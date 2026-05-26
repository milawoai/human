import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';

function writeFiles(tempHome: string) {
  const secretaryDir = path.join(tempHome, '.ai_secretary');
  fs.mkdirSync(secretaryDir, { recursive: true });

  fs.writeFileSync(
    path.join(secretaryDir, 'config.json'),
    JSON.stringify(
      {
        version: 1,
        brain: {
          defaultProfile: 'kimi-coding',
        },
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );

  fs.writeFileSync(
    path.join(secretaryDir, 'profiles.json'),
    JSON.stringify(
      {
        version: 1,
        profiles: {
          'kimi-coding': {
            provider: 'kimi-coding',
            models: ['kimi-for-coding', 'moonshot-v1-128k'],
            defaultModel: 'kimi-for-coding',
            apiKeyEnv: 'KIMI_API_KEY',
          },
        },
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
}

async function main() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'model-config-profiles-'));
  process.env.HOME = tempHome;
  process.env.KIMI_API_KEY = 'dummy';
  writeFiles(tempHome);

  const service = new ModelConfigService();
  const config = service.getConfig({ strictEnv: true });
  assert.equal(config.brain.defaultProfile, 'kimi-coding');
  assert.ok(config.brain.profiles['kimi-coding']);

  const profile = service.getProfile().profile;
  assert.equal(profile.model, 'kimi-for-coding');
  assert.deepEqual(profile.models, ['kimi-for-coding', 'moonshot-v1-128k']);
  assert.equal(profile.defaultModel, 'kimi-for-coding');

  const listed = service.listProfiles();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].model, 'kimi-for-coding');
  console.log('model-config-profiles-smoke: OK');
}

void main();
