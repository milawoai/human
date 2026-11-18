import type { StartupProgress } from './progress'

export async function runStartupTasks(progress: StartupProgress, configure: () => Promise<void>,
  start: (brainReady: (error?: string) => void) => Promise<void>): Promise<void> {
  await progress.run('config', configure)
  progress.begin('brain')
  await start(error => {
    if (error) { progress.fail(error); return }
    progress.complete('brain')
    progress.begin('capabilities')
  })
  progress.complete('capabilities')
}
