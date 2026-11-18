import { WindowManager } from '../../windowManager'
import { startupStages } from '../../../shared/startup'
import { StartupProgress } from './progress'

export const startupProgress = new StartupProgress(startupStages, snapshot => {
  const window = WindowManager.getInstance().getHelloWindow()
  if (window && !window.isDestroyed()) window.webContents.send('startup:state', snapshot)
})
export function status() { return startupProgress.snapshot() }
