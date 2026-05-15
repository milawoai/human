import * as os from 'os';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { ModelConfigService } from '../language-center/model-config.service';
import { MemoryConfig } from './types/memory.types';

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  dbPath: '~/.ai_secretary/sqlite/memory.db',
  obsidianVaultPath: '',
  ignoreDirs: ['.obsidian', 'attachments', '.trash'],
  includeExts: ['.md'],
  chunk: {
    minChars: 400,
    maxChars: 1600,
    overlapChars: 100,
  },
};

@Injectable()
export class MemoryConfigService {
  constructor(private readonly modelConfigService: ModelConfigService) {}

  getConfig(options?: { forceReload?: boolean; strictEnv?: boolean }): MemoryConfig {
    const config = this.modelConfigService.getConfig(options);
    const memory = config.memory ?? {};

    const chunk = {
      ...DEFAULT_MEMORY_CONFIG.chunk,
      ...(memory.chunk ?? {}),
    };

    return {
      dbPath: this.resolveHome(memory.dbPath ?? DEFAULT_MEMORY_CONFIG.dbPath),
      obsidianVaultPath: memory.obsidianVaultPath ?? DEFAULT_MEMORY_CONFIG.obsidianVaultPath,
      ignoreDirs: memory.ignoreDirs ?? DEFAULT_MEMORY_CONFIG.ignoreDirs,
      includeExts: memory.includeExts ?? DEFAULT_MEMORY_CONFIG.includeExts,
      chunk,
    };
  }

  private resolveHome(inputPath: string): string {
    if (inputPath.startsWith('~/')) {
      return path.join(os.homedir(), inputPath.slice(2));
    }
    return inputPath;
  }
}
