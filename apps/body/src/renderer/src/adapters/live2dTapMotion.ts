export interface Live2DMotionGroupInfo {
  group: string
  count: number
}

export interface Live2DModelMotionInfo {
  model?: {
    defaultMotionGroup?: string
  }
  motions?: Live2DMotionGroupInfo[]
}

export interface PointerTapEvent {
  pointerId: number
  clientX: number
  clientY: number
  button?: number
}

export interface PointerDragEvent {
  pointerId: number
  screenX: number
  screenY: number
  button?: number
}

export interface MotionTarget {
  group: string
  index: number
}

const defaultTapMotionGroups: Record<string, string[]> = {
  Head: ['TapHead', 'Tap', 'TapBody'],
  Body: ['TapBody', 'Tap']
}

const fallbackTapMotionGroups = ['Tap', 'TapBody']
const maxTapDistance = 8
const minDragDistance = 8

export const resolveHitAreaMotion = (
  hitAreaName: string | null,
  modelInfo: Live2DModelMotionInfo | null | undefined
): MotionTarget | null => {
  if (!hitAreaName || !modelInfo?.motions?.length) return null

  const candidateGroups = [
    ...(defaultTapMotionGroups[hitAreaName] ?? []),
    modelInfo.model?.defaultMotionGroup,
    ...fallbackTapMotionGroups
  ].filter((group): group is string => group !== undefined)
  const targetGroup =
    candidateGroups.find((group) =>
      modelInfo.motions?.some((motion) => motion.group === group && motion.count > 0)
    ) ??
    modelInfo.motions.find((motion) => motion.group !== 'Idle' && motion.count > 0)?.group

  return targetGroup !== undefined ? { group: targetGroup, index: 0 } : null
}

export const formatTapMotionOutput = (hitAreaName: string, motionTarget: MotionTarget): string => {
  const groupName = motionTarget.group || '<empty>'
  return `Live2D tap: hit=${hitAreaName} motion=${groupName}[${motionTarget.index}]`
}

export const createPointerTapTracker = () => {
  let activePointer: PointerTapEvent | null = null

  return {
    start(event: PointerTapEvent): void {
      activePointer = event.button === 0 ? event : null
    },
    finish(event: PointerTapEvent): boolean {
      if (!activePointer || activePointer.pointerId !== event.pointerId || event.button !== 0) {
        activePointer = null
        return false
      }

      const distance = Math.hypot(event.clientX - activePointer.clientX, event.clientY - activePointer.clientY)
      activePointer = null
      return distance <= maxTapDistance
    },
    cancel(): void {
      activePointer = null
    }
  }
}

export const createPointerDragTracker = () => {
  let activePointer: PointerDragEvent | null = null
  let lastPointer: PointerDragEvent | null = null
  let dragging = false

  return {
    start(event: PointerDragEvent): void {
      activePointer = event.button === 0 ? event : null
      lastPointer = activePointer
      dragging = false
    },
    move(event: PointerDragEvent): { deltaX: number; deltaY: number } | null {
      if (!activePointer || !lastPointer || activePointer.pointerId !== event.pointerId) return null

      const totalDistance = Math.hypot(event.screenX - activePointer.screenX, event.screenY - activePointer.screenY)
      if (!dragging && totalDistance <= minDragDistance) return null

      dragging = true
      const delta = {
        deltaX: event.screenX - lastPointer.screenX,
        deltaY: event.screenY - lastPointer.screenY
      }
      lastPointer = event
      return delta
    },
    finish(event: PointerDragEvent): boolean {
      const didDrag = Boolean(activePointer && activePointer.pointerId === event.pointerId && dragging)
      activePointer = null
      lastPointer = null
      dragging = false
      return didDrag
    },
    cancel(): void {
      activePointer = null
      lastPointer = null
      dragging = false
    }
  }
}
