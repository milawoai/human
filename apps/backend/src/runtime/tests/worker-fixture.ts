import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { spawn, ChildProcess } from 'node:child_process';
import { once } from 'node:events';
@Injectable()
export class WorkerFixture implements OnModuleInit, OnModuleDestroy {
  private child?: ChildProcess;
  onModuleInit() {
    this.child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    console.log(`WORKER_PID=${this.child.pid}`);
  }
  get pid() { return this.child?.pid; }
  async onModuleDestroy() {
    if (!this.child || this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = once(this.child, 'exit');
    this.child.kill();
    await exited;
  }
}
