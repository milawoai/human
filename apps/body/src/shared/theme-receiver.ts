// @ts-expect-error Node strip-types import.
import { validateTheme } from './theme.ts'
import type { ThemeSnapshot } from './theme'
/** All renderer windows use the same ordering rule for bootstrap/query/events. */
export class ThemeReceiver {
  private revision = -1
  private apply: (snapshot: ThemeSnapshot) => void
  constructor(apply: (snapshot: ThemeSnapshot) => void) { this.apply = apply }
  accept(value: ThemeSnapshot) {
    const preference = validateTheme(value)
    if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('Invalid theme revision')
    if (value.revision <= this.revision) return
    this.revision = value.revision
    this.apply({ ...preference, revision: value.revision })
  }
}
