import type { JobSnapshot, WorkerOutcome } from '../jobs.types';
import type { JobRepository } from '../persistence/job.repository';
import { JobError } from '../jobs.errors';
import type { JobExecutorRegistry } from './executor-registry';
import { JobProgressBuffer } from './job-progress';
import { requestApproval } from '../approval/request-approval';
import { performance } from 'node:perf_hooks';

interface DispatchHandle {
  scopeKey: string;
  controller: AbortController;
  finished: Promise<void>;
}
interface DispatchOptions {
  runTimeoutMs?: number;
  changed?: (job: JobSnapshot) => void | Promise<void>;
  diagnostic?: (error: unknown) => void;
}

export class JobDispatcher {
  // Transient cancellation/wait handles only. Job state is always read from SQLite.
  private readonly handles = new Map<string, DispatchHandle>();
  private readonly timeoutMs: number;

  constructor(private readonly repository: JobRepository, private readonly executors: JobExecutorRegistry,
    private readonly options: DispatchOptions = {}) {
    this.timeoutMs = options.runTimeoutMs ?? 300_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
      throw new JobError('JOB_INVALID_INPUT', 'Invalid execution timeout');
    }
  }

  schedule(scopeKey: string, job: JobSnapshot): void {
    if (this.handles.has(job.jobId)) return;
    let finish!: () => void;
    const handle: DispatchHandle = { scopeKey, controller: new AbortController(),
      finished: new Promise<void>(resolve => { finish = resolve; }) };
    this.handles.set(job.jobId, handle);
    setImmediate(() => {
      void this.run(scopeKey, job.jobId, handle).catch(error => this.diagnostic(error)).finally(() => {
        this.handles.delete(job.jobId);
        finish();
      });
    });
    this.changed(job);
  }

  cancel(scopeKey: string, jobId: string): { requested: boolean; job: JobSnapshot } {
    const current = this.repository.get(scopeKey, jobId);
    const next = this.repository.transition(scopeKey, jobId, current.seq, { type: 'cancel' }, Date.now());
    const requested = next.seq !== current.seq;
    if (requested) {
      this.changed(next);
      if (next.state === 'cancelling') this.handles.get(jobId)?.controller.abort();
    }
    return { requested, job: next };
  }

  async waitForIdle(): Promise<void> {
    while (this.handles.size) await Promise.all([...this.handles.values()].map(handle => handle.finished));
  }

  async shutdown(timeoutMs = 10_000): Promise<boolean> {
    for (const [jobId, handle] of this.handles) {
      try { this.cancel(handle.scopeKey, jobId); } catch (error) { this.diagnostic(error); }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([this.waitForIdle().then(() => true),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
    } finally { if (timer) clearTimeout(timer); }
  }

  private async run(scopeKey: string, jobId: string, handle: DispatchHandle): Promise<void> {
    let budget: ReturnType<typeof setTimeout> | undefined;
    let remaining = this.timeoutMs;
    let started = 0;
    const startBudget = () => {
      started = performance.now();
      budget = setTimeout(() => {
        try { this.cancel(scopeKey, jobId); } catch (error) { this.diagnostic(error); }
      }, Math.max(1, remaining));
      budget.unref();
    };
    const progress = new JobProgressBuffer(update => {
      this.changed(this.repository.progress(scopeKey, jobId, update, Date.now()));
    }, error => this.diagnostic(error));
    try {
      const accepted = this.repository.get(scopeKey, jobId);
      if (accepted.state !== 'accepted') return; // cancellation already won; do not load a model
      const spec = this.repository.executionSpec(scopeKey, jobId);
      const running = this.repository.transition(scopeKey, jobId, accepted.seq, { type: 'dispatch' }, Date.now());
      this.changed(running);
      startBudget();
      let outcome: WorkerOutcome;
      try {
        const executor = this.executors.require(running.kind);
        outcome = await executor.execute(spec, { jobId, signal: handle.controller.signal,
          progress: update => progress.update(update),
          approve: async target => {
            clearTimeout(budget);
            remaining -= performance.now() - started;
            try {
              if (remaining <= 0) this.cancel(scopeKey, jobId);
              return await requestApproval(this.repository, scopeKey, jobId, target,
                handle.controller.signal, job => this.changed(job));
            } finally {
              if (!handle.controller.signal.aborted) startBudget();
            }
          } });
      } catch (error) {
        this.diagnostic(error);
        outcome = handle.controller.signal.aborted ? { outcome: 'cancelled' } : { outcome: 'failed', error: { code: 'WORKER_EXECUTION_FAILED',
          message: 'Background executor rejected the execution' } };
      }
      // A progress/notification failure does not rewrite the actual execution outcome.
      try { progress.close(); } catch (error) { this.diagnostic(error); }
      const current = this.repository.get(scopeKey, jobId);
      this.changed(this.repository.settle(scopeKey, jobId, current.seq, outcome, Date.now()));
    } finally {
      if (budget) clearTimeout(budget);
      try { progress.close(); } catch (error) { this.diagnostic(error); }
    }
  }

  private changed(job: JobSnapshot): void {
    try {
      const notification = this.options.changed?.(structuredClone(job));
      if (notification) void Promise.resolve(notification).catch(error => this.diagnostic(error));
    } catch (error) { this.diagnostic(error); }
  }

  private diagnostic(error: unknown): void {
    try {
      if (this.options.diagnostic) this.options.diagnostic(error);
      else console.warn('[jobs] background operation failed', error instanceof JobError ? error.code : 'JOB_INTERNAL_ERROR');
    } catch { /* diagnostics must not become another execution-state authority */ }
  }
}
