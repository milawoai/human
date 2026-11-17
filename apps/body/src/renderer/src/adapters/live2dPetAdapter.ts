import { initializeLive2D } from '@cubismsdksamples/main'
import { getDefaultLive2DPetModel, type Live2DPetModelConfig } from '@shared/live2dPetModels'
import { LAppAdapter } from '../../WebSDK/src/lappadapter'
import { PriorityNormal, updateModelConfig } from '../../WebSDK/src/lappdefine'
import { LAppDelegate } from '../../WebSDK/src/lappdelegate'
import { calculateCanvasPixelSize } from './live2dResize'

class Live2DPetAdapter {
  private coreLoadingPromise: Promise<void> | null = null
  private startPromise: Promise<void> | null = null
  private started = false
  private currentModelConfig: Live2DPetModelConfig | null = null

  async start(modelConfig: Live2DPetModelConfig = getDefaultLive2DPetModel()): Promise<void> {
    if (this.started) return

    if (!this.startPromise) {
      this.startPromise = this.startInternal(modelConfig).finally(() => {
        this.startPromise = null
      })
    }

    await this.startPromise
  }

  private async startInternal(modelConfig: Live2DPetModelConfig): Promise<void> {
    await this.loadCore()
    updateModelConfig(
      modelConfig.resourcePath,
      modelConfig.modelDirectory,
      modelConfig.modelFileName,
      modelConfig.scale
    )
    initializeLive2D()
    this.currentModelConfig = modelConfig
    this.started = true
  }

  release(): void {
    if (!this.started) return

    LAppDelegate.releaseInstance()
    this.started = false
    this.currentModelConfig = null
  }

  isStarted(): boolean {
    return this.started
  }

  playRandomMotion(group?: string): boolean {
    if (!this.started) return false

    const adapter = LAppAdapter.getInstance()
    const targetGroup = this.resolveMotionGroup(adapter, group)
    if (targetGroup === null) return false

    const motionCount = adapter.getMotionCount(targetGroup)
    if (motionCount <= 0) return false

    const motionIndex = Math.floor(Math.random() * motionCount)
    adapter.startMotion(targetGroup, motionIndex, PriorityNormal)
    return true
  }

  playMotion(group: string, index: number): boolean {
    if (!this.started) return false

    const adapter = LAppAdapter.getInstance()
    if (adapter.getMotionCount(group) <= index || index < 0) return false

    adapter.startMotion(group, index, PriorityNormal)
    return true
  }

  playRandomExpression(): boolean {
    if (!this.started) return false

    const adapter = LAppAdapter.getInstance()
    const expressionCount = adapter.getExpressionCount()
    if (expressionCount <= 0) return false

    const expressionIndex = Math.floor(Math.random() * expressionCount)
    const expressionName = adapter.getExpressionName(expressionIndex)
    if (!expressionName) return false

    adapter.setExpression(expressionName)
    return true
  }

  setExpression(name: string): boolean {
    if (!this.started || !name) return false

    const adapter = LAppAdapter.getInstance()
    const expressions = this.getExpressionNames(adapter)
    if (!expressions.includes(name)) return false

    adapter.setExpression(name)
    return true
  }

  getCurrentModelInfo() {
    if (!this.started || !this.currentModelConfig) return null

    const adapter = LAppAdapter.getInstance()

    return {
      model: this.currentModelConfig,
      motions: adapter.getMotionGroups().map((group) => ({
        group,
        count: adapter.getMotionCount(group),
        indices: Array.from({ length: adapter.getMotionCount(group) }, (_, index) => index)
      })),
      expressions: this.getExpressionNames(adapter)
    }
  }

  resizeCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, devicePixelRatio = window.devicePixelRatio): boolean {
    const pixelSize = calculateCanvasPixelSize(cssWidth, cssHeight, devicePixelRatio)
    if (!pixelSize) return false

    const widthChanged = canvas.width !== pixelSize.width
    const heightChanged = canvas.height !== pixelSize.height
    const styleWidth = `${cssWidth}px`
    const styleHeight = `${cssHeight}px`

    canvas.style.width = styleWidth
    canvas.style.height = styleHeight

    if (widthChanged) canvas.width = pixelSize.width
    if (heightChanged) canvas.height = pixelSize.height

    if (this.started && (widthChanged || heightChanged)) {
      LAppDelegate.getInstance().onResize()
    }

    return true
  }

  setModelScale(scale: number): boolean {
    if (!this.started) return false

    const model = LAppAdapter.getInstance().getModel() as any
    if (!model?._modelMatrix) return false

    model._modelMatrix.scale(scale, scale)
    return true
  }

  setExternalLipSyncRms(rms: number | null): boolean {
    if (!this.started) return false

    const model = LAppAdapter.getInstance().getModel() as any
    if (!model?.setExternalLipSyncRms) return false

    model.setExternalLipSyncRms(rms)
    return true
  }

  hitTest(clientX: number, clientY: number, canvas: HTMLCanvasElement): { isHit: boolean; hitAreaName: string | null } {
    if (!this.started || !canvas) return { isHit: false, hitAreaName: null }

    const adapter = LAppAdapter.getInstance()
    const model = adapter.getModel()
    const view = LAppDelegate.getInstance().getView()
    if (!model || !view) return { isHit: false, hitAreaName: null }

    const rect = canvas.getBoundingClientRect()
    if (
      clientX < rect.left ||
      clientY < rect.top ||
      clientX > rect.right ||
      clientY > rect.bottom ||
      canvas.clientWidth <= 0 ||
      canvas.clientHeight <= 0
    ) {
      return { isHit: false, hitAreaName: null }
    }

    const scale = canvas.width / canvas.clientWidth
    const deviceX = (clientX - rect.left) * scale
    const deviceY = (clientY - rect.top) * scale
    const modelX = view._deviceToScreen.transformX(deviceX)
    const modelY = view._deviceToScreen.transformY(deviceY)
    const hitAreaName = model.anyhitTest(modelX, modelY)
    const isHit = hitAreaName !== null || model.isHitOnModel(modelX, modelY)

    return { isHit, hitAreaName }
  }

  private getExpressionNames(adapter: LAppAdapter): string[] {
    return Array.from({ length: adapter.getExpressionCount() }, (_, index) => adapter.getExpressionName(index)).filter(Boolean)
  }

  private resolveMotionGroup(adapter: LAppAdapter, group?: string): string | null {
    if (group !== undefined && adapter.getMotionCount(group) > 0) {
      return group
    }

    const groups = adapter.getMotionGroups()
    const nonIdleGroup = groups.find((motionGroup) => motionGroup !== 'Idle' && adapter.getMotionCount(motionGroup) > 0)
    if (nonIdleGroup !== undefined) return nonIdleGroup

    return groups.find((motionGroup) => adapter.getMotionCount(motionGroup) > 0) ?? null
  }

  private async loadCore(): Promise<void> {
    if ((window as any).Live2DCubismCore) return

    if (!this.coreLoadingPromise) {
      this.coreLoadingPromise = new Promise<void>((resolve, reject) => {
        const existingScript = document.getElementById('live2d-cubism-core')
        if (existingScript) {
          existingScript.addEventListener('load', () => resolve(), { once: true })
          existingScript.addEventListener('error', () => reject(new Error('Live2D Core 加载失败')), {
            once: true
          })
          return
        }

        const script = document.createElement('script')
        script.id = 'live2d-cubism-core'
        script.src = './libs/live2dcubismcore.js'
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Live2D Core 加载失败'))
        document.head.appendChild(script)
      }).finally(() => {
        this.coreLoadingPromise = null
      })
    }

    await this.coreLoadingPromise
  }
}

export const live2dPetAdapter = new Live2DPetAdapter()
