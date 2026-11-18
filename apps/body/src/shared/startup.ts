export interface StartupStage {
  id: string
  loading: string
  ready: string
}
export interface StartupSnapshot {
  revision: number
  state: 'loading' | 'done' | 'failed'
  message: string
  stages: (StartupStage & { state: 'pending' | 'running' | 'done' | 'failed'; message: string })[]
}
export const startupStages: StartupStage[] = [
  { id: 'config', loading: '启动配置准备中', ready: '启动配置已就绪' },
  { id: 'brain', loading: '大脑准备中', ready: '大脑已醒来' },
  { id: 'capabilities', loading: '能力装填中', ready: '能力已装填' }
]
