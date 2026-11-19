import type { JobProgress } from '../jobs.types';
import { JobError } from '../jobs.errors';

export function validateJobProgress(value: JobProgress): JobProgress {
  if (!value || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 2048
    || [value.completed, value.total].some(n => n !== undefined && (!Number.isSafeInteger(n) || n < 0))
    || (value.completed !== undefined && value.total !== undefined && value.completed > value.total)) {
    throw new JobError('JOB_INVALID_INPUT', 'Invalid job progress');
  }
  return { message: value.message,
    ...(value.completed === undefined ? {} : { completed: value.completed }),
    ...(value.total === undefined ? {} : { total: value.total }) };
}

/** Transient coalescing only; persisted snapshots remain the sole progress fact source. */
export class JobProgressBuffer {
  private pending?: JobProgress;
  private timer?: ReturnType<typeof setTimeout>;
  private lastWrite?: number;
  private closed = false;

  constructor(private readonly write: (progress: JobProgress) => void,
    private readonly diagnostic: (error: unknown) => void, private readonly intervalMs = 250) {}

  async update(value: JobProgress): Promise<void> {
    if (this.closed) return; // late executor callbacks cannot mutate a completed job
    this.pending = validateJobProgress(value);
    const remaining = this.lastWrite === undefined ? 0 : this.intervalMs - (Date.now() - this.lastWrite);
    if (remaining <= 0) this.flush();
    else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        try { this.flush(); } catch (error) { this.diagnostic(error); }
      }, remaining);
      this.timer.unref();
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    try { this.flush(); } finally { this.pending = undefined; }
  }

  private flush(): void {
    if (!this.pending) return;
    const progress = this.pending;
    this.write(progress);
    this.pending = undefined;
    this.lastWrite = Date.now();
  }
}
