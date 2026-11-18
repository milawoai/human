import { existsSync, realpathSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
export interface RuntimeCommand { executable: string; args: string[]; cwd: string; deploymentId: string }
export function projectRoot(start: string): string {
  let path = realpathSync(start)
  while (true) {
    const manifest = join(path, 'package.json')
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === 'human-monorepo') return path
    if (dirname(path) === path) throw Error('Cannot locate development project root')
    path = dirname(path)
  }
}
export function resolveRuntime(name: 'node' | 'python', root: string, packaged: boolean): RuntimeCommand {
  if (packaged) throw Error('Packaged backend runtime is not installed; configure connect-only or install a verified runtime bundle')
  if (name === 'python') {
    const cwd = join(root, 'apps/python-service')
    const executable = join(cwd, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
    if (!existsSync(executable)) throw Error('Project Python environment is missing')
    return { executable, args: ['-m', 'runtime.runner'], cwd, deploymentId: root }
  }
  const cwd = join(root, 'apps/backend')
  // Reuse this project's ts-node in development; no yarn/watch/shell launcher.
  const candidates = process.env.HUMAN_NODE_EXECUTABLE ? [process.env.HUMAN_NODE_EXECUTABLE]
    : (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').map(dir => join(dir, 'node'))
  const node = candidates.find(path => existsSync(path))
  if (!node) throw Error('Set HUMAN_NODE_EXECUTABLE to a Node executable for development')
  return { executable: node, args: ['-r', join(root, 'node_modules/ts-node/register/transpile-only'),
    '-r', join(root, 'node_modules/tsconfig-paths/register'), join(cwd, 'src/main.ts')], cwd, deploymentId: root }
}
