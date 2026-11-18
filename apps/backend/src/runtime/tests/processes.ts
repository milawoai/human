import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
export async function verifyRuntimeProcesses() {
  for (const mode of ['http', 'eof', 'signal']) {
    const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', join(__dirname, 'fixture.ts')], {
      cwd: process.cwd(), env: { ...process.env, HUMAN_RUNTIME_OWNED: '1' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const exited = once(child, 'exit');
    let output = '', error = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { error += data; });
    const token = 't'.repeat(64);
    child.stdin.write(JSON.stringify({ type: 'bootstrap', protocolVersion: 1, ownerInstanceId: 'test-owner',
      expectedServiceInstanceId: 'runtime-fixture', ownerToken: token, neuralUrl: 'http://127.0.0.1:19002/neural' }) + '\n');
    try {
      for (let i = 0; i < 100 && !output.includes('FIXTURE_PORT='); i++) await sleep(50);
      const port = Number(output.match(/FIXTURE_PORT=(\d+)/)?.[1]);
      assert(port && ![12002, 12003].includes(port), error);
      const url = `http://127.0.0.1:${port}/runtime`;
      const identity = await (await fetch(`${url}/identity`)).json() as any;
      assert.equal(identity.instanceId, 'runtime-fixture');
      assert.equal((await fetch(`${url}/shutdown`, { method: 'POST' })).status, 401);
      if (mode === 'http') {
        assert.equal((await fetch(`${url}/shutdown`, { method: 'POST', headers: { 'x-human-owner-token': token } })).status, 202);
      } else if (mode === 'eof') child.stdin.end();
      else child.kill('SIGTERM');
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('fixture exit timeout')), 5000); })])
        .finally(() => clearTimeout(timer));
      const workerPid = Number(output.match(/WORKER_PID=(\d+)/)?.[1]);
      assert(workerPid);
      assert.throws(() => process.kill(workerPid, 0), 'nested worker must have exited');
      assert(!output.includes(token) && !error.includes(token));
      console.log(`PASS: real Node ${mode} shutdown reaps nested worker`);
    } finally {
      child.stdin.destroy();
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    }
  }
}
