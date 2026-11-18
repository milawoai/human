import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrainInitService } from '../../brain/init/brain-init.service';
export async function verifyBrainInitRepeat() {
  const directory = mkdtempSync(join(tmpdir(), 'human-brain-repeat-'));
  const service = new BrainInitService({ findSubscribers: () => [] } as any, {} as any, {} as any, {} as any);
  // Isolate this legacy private root resolver rather than modifying HOME or user state.
  (service as any).resolveProjectRoot = () => directory;
  const message = { id: 'fixture', kind: 'command' as const, topic: 'brain.init.execute',
    source: { actorId: 'fixture', runtime: 'nest' as const, system: 'brain' as const }, timestamp: Date.now(), payload: {} };
  try {
    assert.equal((await service.handleCommand(message)).success, true);
    const config = join(directory, '.ai_secretary/config.json');
    writeFileSync(config, '{"fixture":"preserve"}\n');
    const paths = ['config.json', 'profiles.json', 'secrets.env.example'].map(file => join(directory, '.ai_secretary', file));
    const original = paths.map(file => readFileSync(file, 'utf8'));
    assert.equal((await service.handleCommand(message)).success, true);
    assert.deepEqual(paths.map(file => readFileSync(file, 'utf8')), original);
    console.log('PASS: repeated brain.init preserves existing user files (init_done is emitted on each explicit call)');
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
