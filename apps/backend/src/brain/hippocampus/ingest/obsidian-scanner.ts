import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { MemoryConfig } from '../types/memory.types';

export interface ScannedVaultFile {
  sourceUri: string;
  filePath: string;
  mtimeMs: number;
  content: string;
}

@Injectable()
export class ObsidianScanner {
  private static readonly ARCHIVE_NAME_PATTERNS = [/archive/i, /封存/];

  scan(config: MemoryConfig): ScannedVaultFile[] {
    const root = config.obsidianVaultPath;
    if (!root || !fs.existsSync(root)) {
      return [];
    }

    const results: ScannedVaultFile[] = [];
    this.walk(root, root, config, results);
    return results;
  }

  private walk(
    root: string,
    currentDir: string,
    config: MemoryConfig,
    results: ScannedVaultFile[],
  ): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absPath = path.join(currentDir, entry.name);
      const relPath = path.relative(root, absPath);

      if (entry.isDirectory()) {
        if (config.ignoreDirs.includes(entry.name) || this.shouldIgnoreByName(entry.name)) {
          continue;
        }
        this.walk(root, absPath, config, results);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }
      if (this.shouldIgnoreByName(entry.name)) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!config.includeExts.map((item) => item.toLowerCase()).includes(ext)) {
        continue;
      }

      const stat = fs.statSync(absPath);
      const content = fs.readFileSync(absPath, 'utf-8');
      results.push({
        sourceUri: `obsidian://${relPath.replace(/\\/g, '/')}`,
        filePath: absPath,
        mtimeMs: Math.trunc(stat.mtimeMs),
        content,
      });
    }
  }

  private shouldIgnoreByName(name: string): boolean {
    return ObsidianScanner.ARCHIVE_NAME_PATTERNS.some((pattern) => pattern.test(name));
  }
}
