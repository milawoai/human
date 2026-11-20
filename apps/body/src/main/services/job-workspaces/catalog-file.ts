import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { JobWorkspaceCatalog } from '../../../shared/jobWorkspaceCatalog'

export function writeWorkspaceCatalogFile(filePath: string, catalog: JobWorkspaceCatalog): void {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = join(dirname(filePath), `.job-workspaces.${randomUUID()}.tmp`)
  let fd: number | undefined
  try {
    fd = openSync(temporary, 'wx', 0o600)
    writeFileSync(fd, JSON.stringify(catalog))
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(temporary, filePath)
  } finally {
    if (fd !== undefined) closeSync(fd)
    try { unlinkSync(temporary) } catch { /* rename consumed the file */ }
  }
}
