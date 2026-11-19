import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { join } from 'node:path';
import type { JobSnapshot } from '../src/motor/jobs/jobs.types';

interface RaceResult { job?: JobSnapshot; reused?: boolean; code?: string; owner: string }

export async function raceJobAdmission(database: string, keys: [string, string]): Promise<RaceResult[]> {
  const children = keys.map((key, i) => fork(join(__dirname, 'job-storage-contender.ts'),
    [database, `race-owner-${i}`, key], {
      execArgv: ['-r', require.resolve('ts-node/register'), '-r', require.resolve('tsconfig-paths/register')],
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    }));
  const ready = new Set<number>();
  const results: RaceResult[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Admission race fixture timed out')), 30_000);
      let exited = 0;
      for (const [i, child] of children.entries()) {
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('message', (message: { type?: string } & RaceResult) => {
          if (message.type === 'ready') {
            ready.add(i);
            if (ready.size === children.length) children.forEach(c => c.send('submit'));
          } else if (message.type === 'result') results.push(message);
        });
        child.on('exit', code => {
          if (code !== 0) { clearTimeout(timer); reject(new Error(`Contender exited ${code}`)); }
          if (++exited === children.length) { clearTimeout(timer); resolve(); }
        });
      }
    });
    assert.equal(results.length, 2, 'both contenders must return a result');
    return results;
  } finally {
    await Promise.all(children.filter(c => c.exitCode === null && c.signalCode === null).map(c =>
      new Promise<void>(resolve => { c.once('exit', () => resolve()); c.kill('SIGKILL'); })));
  }
}
