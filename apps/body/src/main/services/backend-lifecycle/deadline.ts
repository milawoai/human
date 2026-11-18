import type { LifecycleClock } from './ports'
// @ts-expect-error Node strip-types needs a .ts extension.
import { cancellable } from './cancellation.ts'
/** Probe adapters must bound individual requests by the remaining deadline. */
export async function waitUntil(probe: (remainingMs: number) => Promise<boolean>, clock: LifecycleClock,
  signal: AbortSignal, timeoutMs: number, intervalMs: number): Promise<void> {
  if (timeoutMs <= 0 || intervalMs <= 0) throw Error('Invalid readiness budget')
  const deadline = clock.now() + timeoutMs
  while (clock.now() < deadline) {
    signal.throwIfAborted()
    if (await cancellable(probe(deadline - clock.now()), signal)) {
      signal.throwIfAborted()
      if (clock.now() < deadline) return
    }
    const remaining = deadline - clock.now()
    if (remaining > 0) await cancellable(clock.sleep(Math.min(intervalMs, remaining), signal), signal)
  }
  throw Error('Backend readiness timeout')
}
