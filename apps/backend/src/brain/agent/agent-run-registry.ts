export type AgentRunStatus = 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled';
export interface AgentRunSnapshot {
  runId: string;
  sessionId: string;
  status: AgentRunStatus;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}
interface Entry { snapshot: AgentRunSnapshot; abort?: () => void }

/** Process-local execution ownership. Not a durable Job store. */
export class AgentRunRegistry {
  readonly instanceId = crypto.randomUUID();
  private readonly runs = new Map<string, Entry>();
  private readonly active = new Map<string, string>();
  constructor(private readonly terminalLimit = 200) {}

  begin(runId: string, sessionId: string): void {
    if (this.active.has(sessionId)) throw new Error('AGENT_SESSION_BUSY: 会话已有运行中的任务，请先查询或取消');
    if (this.runs.has(runId)) throw new Error('AGENT_RUN_EXISTS: 运行 ID 已使用，不能自动重发');
    this.runs.set(runId, { snapshot: { runId, sessionId, status: 'running', startedAt: Date.now() } });
    this.active.set(sessionId, runId);
  }

  get(runId?: string, sessionId?: string): AgentRunSnapshot | null {
    let entry = runId ? this.runs.get(runId) : undefined;
    if (!runId && sessionId) {
      const entries = [...this.runs.values()];
      entry = entries.reverse().find(e => e.snapshot.sessionId === sessionId);
    }
    if (entry && sessionId && entry.snapshot.sessionId !== sessionId) throw new Error('运行与会话不匹配');
    return entry ? { ...entry.snapshot } : null;
  }

  attach(runId: string, abort: () => void): void {
    const entry = this.runs.get(runId)!;
    entry.abort = abort;
  }

  cancelling(runId: string): boolean { return this.runs.get(runId)?.snapshot.status === 'cancelling'; }

  cancel(runId: string): AgentRunSnapshot | null {
    const entry = this.runs.get(runId);
    if (!entry) return null;
    if (entry.snapshot.status === 'running') {
      entry.snapshot.status = 'cancelling';
      entry.abort?.();
    }
    return { ...entry.snapshot };
  }

  finish(runId: string, error?: string): AgentRunSnapshot {
    const entry = this.runs.get(runId)!;
    entry.snapshot.status = entry.snapshot.status === 'cancelling' ? 'cancelled' : error ? 'failed' : 'succeeded';
    entry.snapshot.finishedAt = Date.now();
    if (error && entry.snapshot.status !== 'cancelled') entry.snapshot.error = error;
    entry.abort = undefined;
    this.active.delete(entry.snapshot.sessionId);
    const terminal = [...this.runs.entries()].filter(([, e]) => e.snapshot.finishedAt !== undefined);
    for (const [id] of terminal.slice(0, Math.max(0, terminal.length - this.terminalLimit))) this.runs.delete(id);
    return { ...entry.snapshot };
  }
}
