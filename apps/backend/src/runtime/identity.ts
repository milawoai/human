import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { neuralInstanceId } from '../neural/neural-core/actor-registry';
export function deploymentId(): string {
  if (process.env.HUMAN_DEPLOYMENT_ID) return process.env.HUMAN_DEPLOYMENT_ID;
  let current = realpathSync(process.cwd());
  while (true) {
    const file = join(current, 'package.json');
    if (existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).name === 'human-monorepo') return current;
    const parent = dirname(current);
    if (parent === current) return realpathSync(process.cwd());
    current = parent;
  }
}
export const runtimeIdentity = {
  protocolVersion: 1, serviceType: 'node', serviceVersion: '1.0.0',
  deploymentId: deploymentId(), instanceId: randomUUID() as string, neuralInstanceId,
  startedAt: new Date().toISOString(), pid: process.pid,
};
