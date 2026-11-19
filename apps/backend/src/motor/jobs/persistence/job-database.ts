import type { Database } from 'better-sqlite3';
import type { DataSource } from 'typeorm';
import type { BetterSqlite3Driver } from 'typeorm/driver/better-sqlite3/BetterSqlite3Driver';
import { JobError } from '../jobs.errors';

/** One compatibility boundary: borrow TypeORM's existing connection, never open another motor.db handle. */
export function jobDatabase(source: DataSource): Database {
  if (!source.isInitialized || source.options.type !== 'better-sqlite3') {
    throw new JobError('JOB_SCHEMA_INCOMPATIBLE', 'Jobs require an initialized better-sqlite3 DataSource');
  }
  return (source.driver as BetterSqlite3Driver).databaseConnection as Database;
}

/** No await, no nested transaction and no model/tool work inside this write boundary. */
export function jobTransaction<T>(db: Database, operation: () => T): T {
  if (db.inTransaction) throw new JobError('JOB_STORAGE_BUSY', 'Another operation owns the shared database transaction');
  try {
    return db.transaction(operation).immediate();
  } catch (error) {
    if ((error as { code?: string }).code?.startsWith('SQLITE_BUSY')) {
      throw new JobError('JOB_STORAGE_BUSY', 'Job database is busy; no acceptance was committed');
    }
    throw error;
  }
}
