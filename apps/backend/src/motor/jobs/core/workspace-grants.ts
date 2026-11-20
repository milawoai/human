import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, parse } from 'node:path';
import { JobError } from '../jobs.errors';

export interface JobWorkspaceGrant { id: string; path: string; label?: string }
export interface JobWorkspaceConfig {
  version: 1;
  defaultWorkspaceId: string | null;
  workspaces: JobWorkspaceGrant[];
}
export interface ResolvedJobWorkspace { id: string; root: string; label?: string }

const denied = (message: string): never => { throw new JobError('JOB_WORKSPACE_DENIED', message); };

/** Reads the user-approved directory catalog written by Electron's main process. */
export class JobWorkspaceGrants {
  constructor(private readonly configPath = process.env.HUMAN_JOB_WORKSPACES_FILE) {}

  resolve(requestedId?: string, requestedWorkspace?: string): ResolvedJobWorkspace {
    const configPath = this.configPath;
    if (!configPath || !isAbsolute(configPath)) return denied('No Job workspace settings are configured');
    try {
      const configStat = lstatSync(configPath);
      if (!configStat.isFile() || configStat.isSymbolicLink()) denied('Job workspace settings file is invalid');
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as JobWorkspaceConfig;
      if (config?.version !== 1 || !Array.isArray(config.workspaces) || config.workspaces.length > 100) {
        denied('Job workspace settings are invalid');
      }
      const ids = new Set<string>();
      const paths = new Set<string>();
      for (const grant of config.workspaces) {
        if (!grant || typeof grant.id !== 'string' || !grant.id.trim() || grant.id.length > 128
          || typeof grant.path !== 'string' || !grant.path.trim() || grant.path.includes('\0')
          || !isAbsolute(grant.path) || ids.has(grant.id) || paths.has(grant.path)
          || (grant.label !== undefined && (typeof grant.label !== 'string' || !grant.label.trim() || grant.label.length > 256))) {
          denied('Job workspace grant is invalid');
        }
        ids.add(grant.id);
        paths.add(grant.path);
      }
      if (config.workspaces.length > 0 && (typeof config.defaultWorkspaceId !== 'string' || !ids.has(config.defaultWorkspaceId))) {
        denied('Job workspace default is invalid');
      }
      if (config.workspaces.length === 0 && config.defaultWorkspaceId !== null) denied('Job workspace default is invalid');
      let grant: JobWorkspaceGrant | undefined;
      if (requestedWorkspace !== undefined) {
        if (!isAbsolute(requestedWorkspace)) return denied('Job workspace path must be absolute');
        const requestedRoot = realpathSync(requestedWorkspace);
        grant = config.workspaces.find(item => item.path === requestedRoot);
      } else {
        const id = requestedId ?? config.defaultWorkspaceId;
        if (typeof id !== 'string' || !id) return denied('Choose or configure a Job workspace first');
        grant = config.workspaces.find(item => item.id === id);
      }
      if (!grant) return denied('The requested Job workspace has not been authorized');
      const root = realpathSync(grant.path);
      if (root === parse(root).root || !lstatSync(root).isDirectory()) denied('Job workspace must be a user-selected directory');
      return { id: grant.id, root, ...(typeof grant.label === 'string' ? { label: grant.label } : {}) };
    } catch (error) {
      if (error instanceof JobError) throw error;
      return denied('Job workspace settings or selected directory are unavailable');
    }
  }
}
