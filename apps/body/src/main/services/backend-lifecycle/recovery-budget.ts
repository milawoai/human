/** A sliding restart budget for automatic recovery; explicit user retries remain available. */
export class RecoveryBudget {
  private attempts: number[] = []
  take(now: number): boolean {
    this.attempts = this.attempts.filter(time => now - time < 300000)
    if (this.attempts.length >= 3) return false
    this.attempts.push(now)
    return true
  }
}
