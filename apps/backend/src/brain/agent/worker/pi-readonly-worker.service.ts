import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JobsHostService } from '../../../motor/jobs/core/jobs-host.service';
import { LlmService } from '../../language-center/llm.service';
import { ProviderAuthService } from '../../language-center/provider-auth.service';
import { WorkspacePolicy } from './workspace-policy';
import { PiReadonlyExecutor } from './pi-readonly-executor';

@Injectable()
export class PiReadonlyWorkerService implements OnModuleInit {
  private readonly logger = new Logger(PiReadonlyWorkerService.name);
  constructor(private readonly host: JobsHostService, private readonly llm: LlmService,
    private readonly auth: ProviderAuthService) {}
  onModuleInit(): void {
    try {
      if (!this.host.workspaceRoot) return;
      const policy = new WorkspacePolicy(this.host.workspaceRoot);
      this.host.registerExecutor(new PiReadonlyExecutor(policy, this.llm, this.auth), cwd => policy.authorizeCwd(cwd));
    } catch { this.logger.warn('Readonly Job workspace unavailable; Job submission disabled'); }
  }
}
