import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { WorkerOutcome } from '../../../motor/jobs/jobs.types';

export function readonlyWorkerResult(messages: AgentMessage[], evidence: NonNullable<WorkerOutcome['evidence']>, aborted: boolean): WorkerOutcome {
  const last = [...messages].reverse().find(message => message.role === 'assistant');
  if (last?.role !== 'assistant') return aborted ? { outcome: 'cancelled', evidence }
    : { outcome: 'failed', evidence, error: { code: 'WORKER_NO_OUTPUT', message: 'Worker returned no assistant output' } };
  if (last.stopReason === 'aborted') return { outcome: aborted ? 'cancelled' : 'failed', evidence,
    ...(aborted ? {} : { error: { code: 'WORKER_ABORTED', message: 'Model stopped without a host cancellation' } }) };
  if (last.stopReason === 'error') return { outcome: 'failed', evidence,
    error: { code: 'WORKER_MODEL_FAILED', message: 'Model execution failed' } };
  if (last.stopReason !== 'stop') return { outcome: 'failed', evidence,
    error: { code: 'WORKER_INCOMPLETE', message: 'Worker did not finish a complete report' } };
  const report = last.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
  if (!report.trim() || Buffer.byteLength(report, 'utf8') > 64 * 1024 || !evidence.length) {
    return { outcome: 'failed', evidence, error: { code: 'WORKER_INVALID_OUTPUT', message: 'Worker needs a bounded report and actual IO evidence' } };
  }
  return { outcome: 'succeeded', report, evidence };
}
