// Test fixture only: separate process/connection for admission race coverage.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { JobRepository } from '../src/motor/jobs/persistence/job.repository';

async function main() {
  const [database, owner, key] = process.argv.slice(2);
  const source = new DataSource({ type: 'better-sqlite3', database, synchronize: false });
  await source.initialize();
  try {
    const jobs = new JobRepository(source, owner); jobs.initialize();
    process.send!({ type: 'ready' });
    await new Promise<void>(resolve => process.once('message', () => resolve()));
    try {
      const result = jobs.submit('race-scope', { idempotencyKey: key, kind: 'pi-workspace',
        spec: { prompt: 'same race fixture', workspaceId: 'fixture-workspace', cwd: '.' } }, 100);
      process.send!({ type: 'result', ...result, owner });
    } catch (error) {
      process.send!({ type: 'result', code: (error as { code?: string }).code, message: String(error), owner });
    }
  } finally {
    await source.destroy();
    process.disconnect?.();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; process.disconnect?.(); });
