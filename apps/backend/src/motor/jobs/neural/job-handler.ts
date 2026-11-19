import { Injectable, OnModuleInit } from '@nestjs/common';
import { TOPIC } from 'neural-topics';
import { NeuralCoreService } from '../../../neural/neural-core/neural-core.service';
import { NeuralHttpService } from '../../../neural/neural-http/neural-http.service';
import type { BusMessage, Capability } from '../../../neural/interfaces';
import { JobsHostService } from '../core/jobs-host.service';
import { JobError } from '../jobs.errors';
import { JOB_ACTOR } from './job-events';

const topics = [TOPIC.MOTOR_JOB_SUBMIT, TOPIC.MOTOR_JOB_GET, TOPIC.MOTOR_JOB_CANCEL, TOPIC.MOTOR_JOB_RESULT];
@Injectable()
export class JobHandler implements OnModuleInit {
  constructor(private readonly host: JobsHostService, private readonly core: NeuralCoreService,
    private readonly http: NeuralHttpService) {}
  onModuleInit(): void {
    this.core.registerInternalActor(JOB_ACTOR);
    const capabilities: Capability[] = topics.map(topic => ({ id: topic, topic, actor: JOB_ACTOR,
      kinds: topic === TOPIC.MOTOR_JOB_GET || topic === TOPIC.MOTOR_JOB_RESULT ? ['query'] : ['command'],
      mode: 'once', enabled: true, online: true }));
    this.core.registerCapabilities(capabilities);
    this.http.registerCommandHandler(this);
  }
  canHandle(topic: string): boolean { return topics.includes(topic as typeof topics[number]); }
  async handleCommand(message: BusMessage) {
    try {
      if (!this.canHandle(message.topic)) throw new JobError('JOB_INVALID_INPUT', 'Unsupported Job topic');
      const query = message.topic === TOPIC.MOTOR_JOB_GET || message.topic === TOPIC.MOTOR_JOB_RESULT;
      if (message.kind !== (query ? 'query' : 'command')) throw new JobError('JOB_INVALID_INPUT', 'Wrong message kind for Job operation');
      if (message.topic === TOPIC.MOTOR_JOB_SUBMIT) {
        const result = this.host.submit(message.payload);
        return { success: true, data: { jobId: result.job.jobId, state: result.job.state, seq: result.job.seq, reused: result.reused } };
      }
      const payload = message.payload as { jobId?: unknown };
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => key !== 'jobId')
        || typeof payload.jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.jobId)) {
        throw new JobError('JOB_INVALID_INPUT', 'Expected only a valid jobId');
      }
      const data = message.topic === TOPIC.MOTOR_JOB_GET ? this.host.get(payload.jobId)
        : message.topic === TOPIC.MOTOR_JOB_CANCEL ? this.host.cancel(payload.jobId) : this.host.result(payload.jobId);
      return { success: true, data };
    } catch (error) {
      return { success: false, code: error instanceof JobError ? error.code : 'JOB_INTERNAL_ERROR',
        msg: error instanceof JobError ? error.message : 'Job operation failed' };
    }
  }
}
