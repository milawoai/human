import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JobsHostService } from '@/motor/jobs/core/jobs-host.service';
import { LlmService } from '@/brain/language-center/llm.service';
import { ProviderAuthService } from '@/brain/language-center/provider-auth.service';
import { WorkspacePolicy } from '@/brain/agent/worker/workspace-policy';
import { PiReadonlyExecutor } from '@/brain/agent/worker/pi-readonly-executor';
import { configuredJobWorkspace } from '@/motor/jobs/jobs.config';

@Injectable()
export class PiReadonlyWorkerService implements OnModuleInit {
  private readonly logger = new Logger(PiReadonlyWorkerService.name);
  constructor(private readonly host: JobsHostService, private readonly llm: LlmService,
    private readonly auth: ProviderAuthService) {}
  onModuleInit(): void {
    try {
      // BrainModule is global, so Nest may run this hook before JobsModule initializes its host.
      const workspaceRoot = configuredJobWorkspace();
      if (!workspaceRoot) {
        this.logger.warn('Job workspace could not be resolved; read-only executor was not registered');
        return;
      }
      const policy = new WorkspacePolicy(workspaceRoot);
      this.host.registerExecutor(new PiReadonlyExecutor(policy, this.llm, this.auth), cwd => policy.authorizeCwd(cwd));
    } catch (error) {
      this.logger.warn(`Readonly Job workspace unavailable; Job submission disabled: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}
