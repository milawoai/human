import { Module } from '@nestjs/common';
import { BrainLanguageCenterModule } from '../../language-center/language-center.module';
import { MemoryConfigService } from '../memory-config.service';
import { MemoryDatabaseService } from './memory-database.service';

@Module({
  imports: [BrainLanguageCenterModule],
  providers: [MemoryConfigService, MemoryDatabaseService],
  exports: [MemoryConfigService, MemoryDatabaseService],
})
export class MemoryDatabaseModule {}
