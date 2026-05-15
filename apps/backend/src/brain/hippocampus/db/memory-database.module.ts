import { Module } from '@nestjs/common';
import { MemoryDatabaseService } from './memory-database.service';

@Module({
  providers: [MemoryDatabaseService],
  exports: [MemoryDatabaseService],
})
export class MemoryDatabaseModule {}
