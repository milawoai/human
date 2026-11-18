import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { RuntimeCommand } from './runtime-resolver'
export interface ProcessRecord {
  child: ChildProcessWithoutNullStreams
  exited: Promise<void>
  instanceId: string
  token: string
  groupClosed?: boolean
}
export function spawnRuntime(command: RuntimeCommand, env: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
  if (process.platform === 'win32') throw Error('Owned process-tree supervision is not supported on Windows yet; use connect-only')
  return spawn(command.executable, command.args, { cwd: command.cwd, env, shell: false, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
}
export function isRunning(record: ProcessRecord): boolean {
  return record.child.pid !== undefined && record.child.exitCode === null && record.child.signalCode === null
}
/** Only ever used with the detached group created by spawnRuntime. Once
 * observed empty, revoke the record so that it can never target a reused ID. */
export function signalOwnedGroup(record: ProcessRecord, signal: NodeJS.Signals): void {
  if (!record.child.pid || record.groupClosed) return
  try { process.kill(-record.child.pid, signal) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') record.groupClosed = true
    else throw error
  }
}
export function groupAlive(record: ProcessRecord): boolean {
  if (!record.child.pid || record.groupClosed) return false
  try { process.kill(-record.child.pid, 0); return true }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    record.groupClosed = true
    return false
  }
}
export async function reapOwnedGroup(record: ProcessRecord): Promise<void> {
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    if (!groupAlive(record)) return
    signalOwnedGroup(record, signal)
    for (let i = 0; i < 20 && groupAlive(record); i++) await new Promise(resolve => setTimeout(resolve, 50))
  }
  assertGroupGone(record)
}
export async function waitExit(record: ProcessRecord, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([record.exited.then(() => true), new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs)
  })]).finally(() => clearTimeout(timer))
}
export function assertGroupGone(record: ProcessRecord): void {
  if (groupAlive(record)) throw Error('Owned process group still has remaining members')
}
