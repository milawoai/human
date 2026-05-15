import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';
import { MemoryConfigService } from '../src/brain/hippocampus/memory-config.service';
import { MemoryDatabaseService } from '../src/brain/hippocampus/db/memory-database.service';
import { DocumentRepository } from '../src/brain/hippocampus/repositories/document.repository';
import { ChunkRepository } from '../src/brain/hippocampus/repositories/chunk.repository';
import { MarkdownParser } from '../src/brain/hippocampus/ingest/markdown-parser';
import { MarkdownChunker } from '../src/brain/hippocampus/ingest/markdown-chunker';
import { ObsidianScanner } from '../src/brain/hippocampus/ingest/obsidian-scanner';
import { IngestService } from '../src/brain/hippocampus/ingest/ingest.service';
import { QueryNormalizer } from '../src/brain/hippocampus/search/query-normalizer';
import { MemorySearchService } from '../src/brain/hippocampus/search/memory-search.service';
import { MemoryService } from '../src/brain/hippocampus/memory.service';

function setupConfig(tempHome: string, vaultPath: string) {
  const secretaryDir = path.join(tempHome, '.ai_secretary');
  fs.mkdirSync(secretaryDir, { recursive: true });
  fs.writeFileSync(
    path.join(secretaryDir, 'config.json'),
    JSON.stringify(
      {
        version: 1,
        brain: {
          defaultProfile: '',
          profiles: {},
        },
        memory: {
          obsidianVaultPath: vaultPath,
          includeExts: ['.md'],
          ignoreDirs: ['.obsidian', 'attachments', '.trash'],
          chunk: {
            minChars: 50,
            maxChars: 120,
            overlapChars: 20,
          },
        },
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
}

function writeFixtureVault(vaultPath: string) {
  fs.mkdirSync(vaultPath, { recursive: true });
  const a = `---\ntitle: 项目计划\ntags:\n  - memory\n---\n# 项目总览\n这是一个中文段落，包含关键字：秘书自动化 与 记忆检索。\n\n## 细节\n支持 [[Wikilink]] 与中英 mixed content.`;
  const b = `# Long Note\n${'This is a long paragraph about retrieval. '.repeat(20)}\n`;
  fs.writeFileSync(path.join(vaultPath, 'a.md'), a, 'utf-8');
  fs.writeFileSync(path.join(vaultPath, 'b.md'), b, 'utf-8');
}

async function main() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-smoke-home-'));
  const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-smoke-vault-'));
  process.env.HOME = tempHome;

  writeFixtureVault(vaultPath);
  setupConfig(tempHome, vaultPath);

  const modelConfig = new ModelConfigService();
  const memoryConfig = new MemoryConfigService(modelConfig);
  const db = new MemoryDatabaseService(memoryConfig);
  const docRepo = new DocumentRepository(db);
  const chunkRepo = new ChunkRepository(db);
  const parser = new MarkdownParser();
  const chunker = new MarkdownChunker();
  const scanner = new ObsidianScanner();
  const ingest = new IngestService(memoryConfig, scanner, parser, chunker, docRepo, chunkRepo);
  const normalizer = new QueryNormalizer();
  const searchService = new MemorySearchService(db, normalizer);
  const memoryService = new MemoryService(memoryConfig, ingest, searchService, docRepo, chunkRepo);

  const normalized = normalizer.normalize('  秘书 自动化  ');
  assert.equal(normalized, '秘书 自动化');

  const parsed = parser.parse({ sourceUri: 'obsidian://demo.md', raw: '# T\n' + 'x'.repeat(320) });
  const testChunks = chunker.chunk(parsed, { minChars: 50, maxChars: 100, overlapChars: 10 });
  assert.ok(testChunks.length >= 3);

  const first = memoryService.reindexObsidianVault();
  assert.equal(first.scanned, 2);
  assert.equal(first.created, 2);
  assert.equal(first.failed, 0);

  const found = memoryService.search({ query: '秘书自动化', limit: 5 });
  assert.ok(found.length >= 1);

  const doc = docRepo.getBySourceUri('obsidian://a.md');
  assert.ok(doc);
  const chunks = chunkRepo.listByDocumentId(doc!.id);
  assert.ok(chunks.length >= 1);

  const second = memoryService.reindexObsidianVault();
  assert.equal(second.scanned, 2);
  assert.equal(second.skipped, 2);

  fs.appendFileSync(path.join(vaultPath, 'a.md'), '\n\n新增内容 update token', 'utf-8');
  const third = memoryService.reindexObsidianVault();
  assert.equal(third.scanned, 2);
  assert.equal(third.updated, 1);

  console.log('memory-smoke: OK');
}

void main();
