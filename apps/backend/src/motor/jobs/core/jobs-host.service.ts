import { Injectable, Logger, OnModuleInit, OnApplicationBootstrap, BeforeApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { runtimeIdentity } from '../../../runtime/identity';
import { JobRepository } from '../persistence/job.repository';
import { JobOwner } from './job-owner';
import { JobExecutorRegistry } from './executor-registry';
import { JobDispatcher } from './job-dispatcher';
import { JobService } from './job.service';
import { JobError } from '../jobs.errors';
import { configuredJobPromptMaxChars, configuredJobWorkspace } from '../jobs.config';
import { JobEvents } from '../neural/job-events';
import type { JobExecutor } from '../jobs.types';
import { parseSubmitJob } from './job-input';

@Injectable()
export class JobsHostService implements OnModuleInit, OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(JobsHostService.name);
  private readonly registry = new JobExecutorRegistry();
  workspaceRoot?: string;
  private authorizeCwd?: (cwd: string) => string;
  private repository?: JobRepository;
  private owner?: JobOwner;
  private dispatcher?: JobDispatcher;
  private service?: JobService;
  private accepting = false;
  private owns = false;
  private failure?: JobError;
  private closing?: Promise<void>;
  private scopeKey = '';
  private promptMaxChars = 0;

  constructor(private readonly source: DataSource, private readonly events: JobEvents) {}

  onModuleInit(): void {
    try {
      this.workspaceRoot = configuredJobWorkspace();
      const promptMaxChars = configuredJobPromptMaxChars();
      if (!promptMaxChars) throw new JobError('JOB_NOT_READY', 'HUMAN_JOB_PROMPT_MAX_CHARS must be an integer from 1 to 1000000');
      this.promptMaxChars = promptMaxChars;
      this.repository = new JobRepository(this.source, runtimeIdentity.instanceId, undefined, promptMaxChars);
      this.repository.initialize();
      this.owner = new JobOwner(this.source, runtimeIdentity);
      this.dispatcher = new JobDispatcher(this.repository, this.registry, {
        changed: job => this.events.changed(job), diagnostic: () => this.logger.warn('Job background operation failed; inspect persisted state'),
      });
      this.service = new JobService(this.repository, this.dispatcher);
    } catch { this.failure = new JobError('JOB_NOT_READY', 'Job storage or workspace configuration is unavailable'); }
  }

  registerExecutor(executor: JobExecutor, authorizeCwd: (cwd: string) => string): void {
    this.registry.register('pi-readonly', executor);
    this.authorizeCwd = authorizeCwd;
  }

  onApplicationBootstrap(): void {
    if (this.failure) return;
    try {
      if (!this.workspaceRoot || !this.authorizeCwd) throw new JobError('JOB_NOT_READY', 'No authorized Job workspace/executor is configured');
      this.registry.require('pi-readonly');
      const recovered = this.owner!.acquire();
      this.owns = true;
      this.scopeKey = createHash('sha256').update(JSON.stringify([
        process.getuid?.() ?? 'local', runtimeIdentity.deploymentId, this.workspaceRoot,
      ])).digest('hex');
      this.accepting = true;
      for (const job of recovered) {
        try { this.events.changed(job); } catch { this.logger.warn('Job recovery notification failed'); }
      }
    } catch (error) {
      this.failure = error instanceof JobError ? error : new JobError('JOB_NOT_READY', 'Job host initialization failed');
      this.logger.warn(this.failure.message);
    }
  }

  submit(value: unknown) {
    this.ready();
    const input = parseSubmitJob(value, this.promptMaxChars);
    const cwd = this.authorizeCwd!(input.spec.cwd);
    return this.service!.submit(this.scopeKey, { ...input, spec: { ...input.spec, cwd } });
  }
  get(jobId: string) { this.ready(); return this.service!.get(this.scopeKey, jobId); }
  result(jobId: string) { this.ready(); return this.service!.result(this.scopeKey, jobId); }
  cancel(jobId: string) { this.ready(); return this.service!.cancel(this.scopeKey, jobId); }

  beforeApplicationShutdown(): Promise<void> { return this.closing ??= this.shutdown(); }
  private async shutdown(): Promise<void> {
    this.accepting = false;
    if (!this.owns) return;
    await this.dispatcher!.shutdown();
    for (const job of this.owner!.markUncertain('host shutdown before result confirmation')) {
      try { this.events.changed(job); } catch { this.logger.warn('Job shutdown notification failed'); }
    }
    this.owner!.release();
    this.owns = false;
  }
  private ready(): void {
    if (!this.accepting) throw this.failure ?? new JobError('JOB_NOT_READY', 'Job host is starting or stopping');
  }
}
