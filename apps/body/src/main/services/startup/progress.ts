import type { StartupStage, StartupSnapshot } from '../../../shared/startup'

/** One startup only: task owners report facts; the UI never invents progress. */
export class StartupProgress {
  private value: StartupSnapshot
  private publish: (value: StartupSnapshot) => void
  constructor(stages: StartupStage[], publish: (value: StartupSnapshot) => void = () => {}) {
    this.publish = publish
    if (new Set(stages.map(stage => stage.id)).size !== stages.length) throw Error('Duplicate startup stage')
    this.value = { revision: 0, state: 'loading', message: '准备启动',
      stages: stages.map(stage => ({ ...stage, state: 'pending', message: stage.loading })) }
  }
  snapshot(): StartupSnapshot { return structuredClone(this.value) }
  async run<T>(id: string, load: () => Promise<T>): Promise<T> {
    this.begin(id)
    try {
      const result = await load()
      this.complete(id)
      return result
    } catch (error) {
      this.fail('初始化失败，请打开设置与诊断')
      throw error
    }
  }
  begin(id: string) { this.update(id, 'running') }
  complete(id: string) { this.update(id, 'done') }
  fail(message: string) {
    if (this.value.state === 'failed') return
    this.value.state = 'failed'
    this.value.message = message
    for (const stage of this.value.stages) if (stage.state === 'running') stage.state = 'failed'
    this.emit()
  }
  private update(id: string, state: 'running' | 'done') {
    const stage = this.value.stages.find(stage => stage.id === id)
    if (!stage) throw Error(`Unknown startup stage: ${id}`)
    if (this.value.state === 'failed') return
    stage.state = state
    stage.message = state === 'done' ? stage.ready : stage.loading
    this.value.message = stage.message
    this.value.state = this.value.stages.every(stage => stage.state === 'done') ? 'done' : 'loading'
    this.emit()
  }
  private emit() { this.value.revision++; this.publish(this.snapshot()) }
}
