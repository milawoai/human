import { createHmac } from 'node:crypto';
import type { JobApproval, JobApprovalDecision } from '@/motor/jobs/jobs.types';

type Receive = (id: string, seq: number, decision: JobApprovalDecision) => boolean;
let send: ((frame: object) => void) | undefined;
let receive: Receive | undefined;

export const approvalChannel = {
  available: () => !!send,
  request(request: JobApproval, decide: Receive): () => void {
    if (!send || receive) throw Error('Approval channel unavailable');
    receive = decide;
    try { send({ type: 'job-approval', ...request }); }
    catch (error) { receive = undefined; throw error; }
    return () => {
      if (receive === decide) receive = undefined;
      send?.({ type: 'job-approval-close', approvalId: request.approvalId });
    };
  },
  connect(token: string, instanceId: string, write: (line: string) => void = line => { process.stdout.write(line); }) {
    send = frame => {
      const body = JSON.stringify({ ...frame, instanceId });
      const mac = createHmac('sha256', token).update(body).digest('hex');
      write(`\n[human-job-approval] ${mac} ${body}\n`);
    };
  },
  frame(value: Record<string, unknown>, instanceId: string) {
    const { approvalId, seq, decision } = value;
    if (value.type !== 'job-approval-decision' || value.instanceId !== instanceId
      || typeof approvalId !== 'string' || typeof seq !== 'number'
      || (decision !== 'once' && decision !== 'deny' && decision !== 'directory')) return;
    if (receive?.(approvalId, seq, decision) && decision === 'directory') {
      send?.({ type: 'job-approval-persist', approvalId });
    }
  },
  disconnect() { send = undefined; },
};
