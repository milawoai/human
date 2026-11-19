import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { JobRepository } from '../persistence/job.repository';
import { JobExecutorRegistry } from '../core/executor-registry';
import { JobDispatcher } from '../core/job-dispatcher';
import { JobService } from '../core/job.service';
import type { JobSnapshot, WorkerOutcome } from '../jobs.types';

export const input = (key: string) => ({ idempotencyKey: key, kind: 'pi-readonly' as const,
  spec: { prompt: 'fixture', cwd: '/fixture' } });
export const tick = () => new Promise<void>(resolve => setImmediate(resolve));
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
export async function dispatchFixture(timeoutMs = 300_000, onChanged?: (job: JobSnapshot) => void | Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'human-job-dispatch-'));
  const source = new DataSource({ type: 'better-sqlite3', database: join(directory, 'motor.db'), synchronize: false });
  await source.initialize();
  const repository = new JobRepository(source, 'fixture-owner'); repository.initialize();
  const registry = new JobExecutorRegistry();
  const diagnostics: unknown[] = [];
  const changed: string[] = [];
  const dispatcher = new JobDispatcher(repository, registry, {
    runTimeoutMs: timeoutMs, diagnostic: error => diagnostics.push(error),
    changed: job => { changed.push(`${job.jobId}:${job.state}:${job.seq}`); return onChanged?.(job); },
  });
  const service = new JobService(repository, dispatcher);
  const gates: Array<ReturnType<typeof deferred<WorkerOutcome>>> = [];
  return { source, repository, registry, dispatcher, service, diagnostics, changed,
    gate() { const gate = deferred<WorkerOutcome>(); gates.push(gate); return gate; },
    async close() {
      for (const gate of gates) gate.resolve({ outcome: 'cancelled' });
      await dispatcher.waitForIdle();
      await source.destroy(); rmSync(directory, { recursive: true, force: true });
    },
  };
}
