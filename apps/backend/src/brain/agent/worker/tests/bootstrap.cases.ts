import assert from 'node:assert/strict';
import { configuredJobWorkspace } from '@/motor/jobs/jobs.config';
import type { JobsHostService } from '@/motor/jobs/core/jobs-host.service';
import type { LlmService } from '@/brain/language-center/llm.service';
import type { ProviderAuthService } from '@/brain/language-center/provider-auth.service';
import { PiReadonlyWorkerService } from '@/brain/agent/worker/pi-readonly-worker.service';

export function verifyWorkerRegistrationDoesNotDependOnModuleOrder(): void {
  const previousRoot = process.env.HUMAN_JOB_WORKSPACE_ROOT;
  delete process.env.HUMAN_JOB_WORKSPACE_ROOT;
  let registered = false;
  let authorizeCwd: ((cwd: string) => string) | undefined;
  const host = {
    workspaceRoot: undefined,
    registerExecutor(_executor: unknown, authorize: (cwd: string) => string) {
      registered = true;
      authorizeCwd = authorize;
    },
  } as unknown as JobsHostService;

  try {
    const root = configuredJobWorkspace();
    assert.ok(root, 'the backend workspace should be found from cwd or its ancestors');
    new PiReadonlyWorkerService(host, {} as LlmService, {} as ProviderAuthService).onModuleInit();
    assert.ok(registered, 'worker must register even when JobsHost.onModuleInit has not run yet');
    assert.equal(authorizeCwd?.(root), root, 'the registered authorizer must use the resolved workspace');
  } finally {
    if (previousRoot === undefined) delete process.env.HUMAN_JOB_WORKSPACE_ROOT;
    else process.env.HUMAN_JOB_WORKSPACE_ROOT = previousRoot;
  }
}
