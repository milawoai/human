import { Injectable, OnModuleInit } from '@nestjs/common';
import { JobsHostService } from '@/motor/jobs/core/jobs-host.service';
import { LlmService } from '@/brain/language-center/llm.service';
import { ProviderAuthService } from '@/brain/language-center/provider-auth.service';
import { WorkspacePolicy } from '@/brain/agent/worker/workspace-policy';
import { PiWorkspaceExecutor } from '@/brain/agent/worker/pi-workspace-executor';
import { JobWorkspaceGrants } from '@/motor/jobs/core/workspace-grants';

@Injectable()
export class PiWorkspaceWorkerService implements OnModuleInit {
  constructor(private readonly host: JobsHostService, private readonly llm: LlmService,
    private readonly auth: ProviderAuthService) {}
  onModuleInit(): void {
    // BrainModule may initialize before JobsModule; workspace grants are resolved per submission.
    const grants = new JobWorkspaceGrants();
    this.host.registerExecutor(new PiWorkspaceExecutor(grants, this.llm, this.auth), (workspaceId, workspace, cwd) => {
      const grant = grants.resolve(workspaceId, workspace);
      new WorkspacePolicy(grant.root).authorizeCwd(cwd);
      return grant.id;
    });
  }
}
