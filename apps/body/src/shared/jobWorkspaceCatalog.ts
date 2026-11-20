export interface JobWorkspaceGrant {
  id: string
  path: string
  label: string
}

export interface JobWorkspaceCatalog {
  version: 1
  defaultWorkspaceId: string | null
  workspaces: JobWorkspaceGrant[]
}

const MAX_WORKSPACES = 100
const MAX_ID_LENGTH = 128
const MAX_LABEL_LENGTH = 256

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

export function parseWorkspaceCatalog(value: unknown): JobWorkspaceCatalog {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.workspaces)) {
    throw new Error('Invalid Job workspace catalog')
  }
  if (value.workspaces.length > MAX_WORKSPACES) throw new Error('Job workspace catalog exceeds the 100 grant limit')
  const ids = new Set<string>()
  const paths = new Set<string>()
  const workspaces = value.workspaces.map((entry): JobWorkspaceGrant => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > MAX_ID_LENGTH ||
        typeof entry.path !== 'string' || !entry.path.trim() || entry.path.includes('\0') || !isAbsolutePath(entry.path) ||
        typeof entry.label !== 'string' || !entry.label.trim() || entry.label.length > MAX_LABEL_LENGTH) {
      throw new Error('Invalid Job workspace grant')
    }
    if (ids.has(entry.id) || paths.has(entry.path)) throw new Error('Duplicate Job workspace grant')
    ids.add(entry.id)
    paths.add(entry.path)
    return { id: entry.id, path: entry.path, label: entry.label }
  })
  const defaultWorkspaceId = value.defaultWorkspaceId
  if (defaultWorkspaceId !== null && (typeof defaultWorkspaceId !== 'string' || !ids.has(defaultWorkspaceId))) {
    throw new Error('Invalid default Job workspace grant')
  }
  if (workspaces.length > 0 && defaultWorkspaceId === null) throw new Error('Job workspace default is required')
  return { version: 1, defaultWorkspaceId, workspaces }
}

export function createEmptyWorkspaceCatalog(): JobWorkspaceCatalog {
  return { version: 1, defaultWorkspaceId: null, workspaces: [] }
}

export function addWorkspace(catalog: JobWorkspaceCatalog, grant: JobWorkspaceGrant): JobWorkspaceCatalog {
  if (catalog.workspaces.some(item => item.path === grant.path)) return catalog
  if (catalog.workspaces.length >= MAX_WORKSPACES) throw new Error('Job workspace catalog reached the 100 grant limit')
  return {
    ...catalog,
    defaultWorkspaceId: catalog.defaultWorkspaceId ?? grant.id,
    workspaces: [...catalog.workspaces, grant]
  }
}

export function setDefaultWorkspace(catalog: JobWorkspaceCatalog, id: string): JobWorkspaceCatalog {
  if (!catalog.workspaces.some(item => item.id === id)) throw new Error('Job workspace is not authorized')
  return { ...catalog, defaultWorkspaceId: id }
}

export function removeWorkspace(catalog: JobWorkspaceCatalog, id: string): JobWorkspaceCatalog {
  const workspaces = catalog.workspaces.filter(item => item.id !== id)
  if (workspaces.length === catalog.workspaces.length) throw new Error('Job workspace is not authorized')
  const defaultWorkspaceId = catalog.defaultWorkspaceId === id
    ? workspaces[0]?.id ?? null
    : catalog.defaultWorkspaceId
  return { ...catalog, defaultWorkspaceId, workspaces }
}
