import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';

export function configuredJobWorkspace(): string | undefined {
  const configured = process.env.HUMAN_JOB_WORKSPACE_ROOT;
  if (configured) return isAbsolute(configured) ? realpathSync(configured) : undefined;
  let directory = realpathSync(process.cwd());
  while (true) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === 'human-monorepo') return directory;
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}
