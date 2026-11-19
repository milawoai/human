import { Module } from '@nestjs/common';
import { NeuralModule } from '../../neural/neural.module';
import { JobsHostService } from './core/jobs-host.service';
import { JobEvents } from './neural/job-events';
import { JobHandler } from './neural/job-handler';

@Module({ imports: [NeuralModule], providers: [JobsHostService, JobEvents, JobHandler], exports: [JobsHostService] })
export class JobsModule {}
