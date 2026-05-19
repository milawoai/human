import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ObsidianScanner } from '../src/brain/hippocampus/ingest/obsidian-scanner';
import { MemoryConfig } from '../src/brain/hippocampus/types/memory.types';

function touch(filePath: string, content = '# note\n') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function main() {
  const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-scanner-ignore-'));

  touch(path.join(vaultPath, 'normal.md'));
  touch(path.join(vaultPath, 'Archive', 'in-archive-dir.md'));
  touch(path.join(vaultPath, 'archive-notes', 'in-archive-lower-dir.md'));
  touch(path.join(vaultPath, '项目封存', 'in-cn-archive-dir.md'));
  touch(path.join(vaultPath, 'my-Archive-note.md'));
  touch(path.join(vaultPath, 'my-archive-note.md'));
  touch(path.join(vaultPath, '项目封存说明.md'));

  const config: MemoryConfig = {
    dbPath: '',
    obsidianVaultPath: vaultPath,
    ignoreDirs: ['.obsidian', 'attachments', '.trash'],
    includeExts: ['.md'],
    chunk: {
      minChars: 50,
      maxChars: 120,
      overlapChars: 20,
    },
  };

  const scanner = new ObsidianScanner();
  const files = scanner.scan(config);
  const sourceUris = files.map((item) => item.sourceUri).sort();

  assert.deepEqual(sourceUris, ['obsidian://normal.md']);
  console.log('obsidian-scanner-ignore-smoke: OK');
}

main();
