import { JobError } from '../jobs.errors';
import type { JobExecutor, SubmitJob } from '../jobs.types';

export class JobExecutorRegistry {
  private readonly executors = new Map<SubmitJob['kind'], JobExecutor>();

  register(kind: SubmitJob['kind'], executor: JobExecutor): void {
    if (this.executors.has(kind)) throw new JobError('JOB_EXECUTOR_CONFLICT', `Executor already registered for ${kind}`);
    this.executors.set(kind, executor);
  }

  require(kind: SubmitJob['kind']): JobExecutor {
    const executor = this.executors.get(kind);
    if (!executor) throw new JobError('JOB_EXECUTOR_UNAVAILABLE', `No executor registered for ${kind}`);
    return executor;
  }
}
