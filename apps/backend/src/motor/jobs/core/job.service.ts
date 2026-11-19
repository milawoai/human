import type { JobRepository } from '../persistence/job.repository';
import type { JobDispatcher } from './job-dispatcher';

/** Internal use cases. Neural authorization/readiness is added at the host boundary. */
export class JobService {
  constructor(private readonly repository: JobRepository, private readonly dispatcher: JobDispatcher) {}

  submit(scopeKey: string, input: unknown) {
    const accepted = this.repository.submit(scopeKey, input, Date.now());
    if (!accepted.reused) this.dispatcher.schedule(scopeKey, accepted.job);
    return accepted;
  }

  get(scopeKey: string, jobId: string) { return this.repository.get(scopeKey, jobId); }
  result(scopeKey: string, jobId: string) { return this.repository.result(scopeKey, jobId); }
  cancel(scopeKey: string, jobId: string) { return this.dispatcher.cancel(scopeKey, jobId); }
}
