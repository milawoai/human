// @ts-expect-error Node strip-types import.
import { defaultTheme, validateTheme } from '../../../shared/theme.ts'
import type { ThemePreference, ThemeSnapshot } from '../../../shared/theme'

export class ThemeController {
  private value: ThemeSnapshot
  private save: (value: ThemePreference) => void
  private publish: (value: ThemeSnapshot) => void
  constructor(saved: unknown, save: (value: ThemePreference) => void, publish: (value: ThemeSnapshot) => void) {
    let preference = defaultTheme
    try { preference = validateTheme(saved) } catch { /* Recover invalid legacy settings. */ }
    this.value = { ...preference, revision: 0 }
    this.save = save
    this.publish = publish
  }
  snapshot(): ThemeSnapshot { return { ...this.value } }
  set(input: unknown): ThemeSnapshot {
    const next = validateTheme(input)
    if (next.id === this.value.id && next.fontScale === this.value.fontScale) return this.snapshot()
    this.save(next)
    this.value = { ...next, revision: this.value.revision + 1 }
    this.publish(this.snapshot())
    return this.snapshot()
  }
}
