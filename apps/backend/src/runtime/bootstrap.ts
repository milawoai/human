import type { INestApplication } from '@nestjs/common';
import { RuntimeService } from './runtime.service';
import { readOwnerBootstrap } from './owner-channel';
/** Start this before creating Nest, so a lost parent cannot leave a starting app. */
export async function prepareOwner() {
  let lost = false;
  let stop: (() => void) | undefined;
  const owner = process.env.HUMAN_RUNTIME_OWNED === '1'
    ? await readOwnerBootstrap(process.stdin, () => { lost = true; stop?.(); }) : undefined;
  return async (app: INestApplication) => {
    const runtime = app.get(RuntimeService);
    if (owner) runtime.configure(owner);
    runtime.setShutdown(async () => {
      await app.close();
      if (owner) process.stdin.destroy();
    });
    stop = () => { void runtime.shutdown().catch(() => { process.exitCode = 1; }); };
    if (lost) { await runtime.shutdown(); throw Error('Owner exited during startup'); }
    app.enableShutdownHooks();
  };
}
