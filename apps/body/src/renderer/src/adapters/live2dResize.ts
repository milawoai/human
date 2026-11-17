export interface CanvasPixelSize {
  width: number
  height: number
}

export interface PetWindowScaleSizeOptions {
  baseWidth: number
  baseHeight: number
  baseScale: number
  targetScale: number
  growthFactor?: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
}

export const minLive2DScale = 0.4
export const maxLive2DScale = 3
export const wheelScaleStep = 0.03
export const defaultPetWindowWidth = 300
export const defaultPetWindowHeight = 440
export const minPetWindowWidth = 220
export const minPetWindowHeight = 320

export const calculateCanvasPixelSize = (
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio = 1
): CanvasPixelSize | null => {
  if (cssWidth <= 0 || cssHeight <= 0) return null

  const dpr = Math.max(devicePixelRatio || 1, 1)
  return {
    width: Math.max(1, Math.round(cssWidth * dpr)),
    height: Math.max(1, Math.round(cssHeight * dpr))
  }
}

export const clampLive2DScale = (scale: number): number => {
  return Math.min(maxLive2DScale, Math.max(minLive2DScale, Number(scale.toFixed(2))))
}

export const calculateWheelScale = (currentScale: number, deltaY: number): number => {
  const direction = deltaY > 0 ? -1 : 1
  return clampLive2DScale(currentScale + wheelScaleStep * direction)
}

export const calculatePetWindowSizeForScale = ({
  baseWidth,
  baseHeight,
  baseScale,
  targetScale,
  growthFactor = 1,
  minWidth = minPetWindowWidth,
  minHeight = minPetWindowHeight,
  maxWidth = 900,
  maxHeight = 1200
}: PetWindowScaleSizeOptions) => {
  const safeBaseScale = baseScale > 0 ? baseScale : 1
  const scaleRatio = targetScale / safeBaseScale
  const ratio = 1 + (scaleRatio - 1) * growthFactor

  return {
    width: Math.min(maxWidth, Math.max(minWidth, Math.round(baseWidth * ratio))),
    height: Math.min(maxHeight, Math.max(minHeight, Math.round(baseHeight * ratio)))
  }
}
