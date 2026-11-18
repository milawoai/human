import { appendFileSync, existsSync, renameSync, statSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
/** Lifecycle summaries only, never child output, tokens, audio or transcripts. */
export function createLifecycleLog(file: string): (message: string) => void {
  return message => {
    try {
      mkdirSync(dirname(file), { recursive: true })
      if (existsSync(file) && statSync(file).size > 512 * 1024) {
        for (let i = 2; i >= 1; i--) if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`)
        renameSync(file, `${file}.1`)
      }
      appendFileSync(file, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 })
    } catch { /* Logging failure never authorizes a process action. */ }
  }
}
