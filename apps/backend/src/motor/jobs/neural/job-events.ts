import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TOPIC } from 'neural-topics';
import { NeuralCoreService } from '../../../neural/neural-core/neural-core.service';
import { NeuralWsGateway } from '../../../neural/neural-ws/neural-ws.gateway';
import type { JobSnapshot } from '../jobs.types';
import { isJobSettled } from '../core/job-state';

export const JOB_ACTOR = { actorId: 'motor-jobs', runtime: 'nest', system: 'motor', module: 'jobs' } as const;

@Injectable()
export class JobEvents {
  constructor(private readonly core: NeuralCoreService, private readonly ws: NeuralWsGateway) {}
  changed(job: JobSnapshot): void {
    this.publish(TOPIC.MOTOR_JOB_CHANGED, job);
    if (isJobSettled(job.state)) this.publish(TOPIC.MOTOR_JOB_SETTLED, job);
  }
  private publish(topic: string, job: JobSnapshot): void {
    const message = { id: randomUUID(), kind: 'event' as const, topic, source: JOB_ACTOR, timestamp: Date.now(), payload: job };
    const result = this.core.route(message);
    for (const subscriber of result.subscribers) this.ws.sendToConnection(subscriber.connectionId, 'message', message);
  }
}
