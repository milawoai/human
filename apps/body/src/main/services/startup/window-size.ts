interface WorkArea { x: number; y: number; width: number; height: number }
/** Scale the welcome geometry with text, bounded by the current display. */
export function startupWindowBounds(fontScale: number, area: WorkArea): WorkArea {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1
  const width = Math.min(Math.round(480 * scale), area.width)
  const height = Math.min(Math.round(320 * scale), area.height)
  return { width, height, x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2) }
}
