import assert from 'node:assert/strict';
import type { JobsHostService } from '@/motor/jobs/core/jobs-host.service';
import type { LlmService } from '@/brain/language-center/llm.service';
import type { ProviderAuthService } from '@/brain/language-center/provider-auth.service';
import { PiWorkspaceWorkerService } from '@/brain/agent/worker/pi-workspace-worker.service';
import { JobError } from '@/motor/jobs/jobs.errors';

export function verifyWorkerRegistrationDoesNotDependOnModuleOrder(): void {
  let registered = false;
  let resolveWorkspace: ((workspaceId: string | undefined, workspace: string | undefined, cwd: string) => string) | undefined;
  const host = {
    registerExecutor(_executor: unknown, resolve: (workspaceId: string | undefined, workspace: string | undefined, cwd: string) => string) {
      registered = true;
      resolveWorkspace = resolve;
    },
  } as unknown as JobsHostService;

  new PiWorkspaceWorkerService(host, {} as LlmService, {} as ProviderAuthService).onModuleInit();
  assert.ok(registered, 'worker must register even when JobsHost.onModuleInit has not run yet');
  assert.throws(() => resolveWorkspace?.(undefined, undefined, '.'),
    (error: unknown) => error instanceof JobError && error.code === 'JOB_WORKSPACE_DENIED',
    'worker registration does not grant access to the monorepo or any implicit directory');
}
