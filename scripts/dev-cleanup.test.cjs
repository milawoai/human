const test = require('node:test');
const assert = require('node:assert/strict');
const { selectProcesses } = require('./dev-cleanup.cjs');
const { cleanup } = require('./dev-cleanup.cjs');
const { parseSnapshot, pendingProcesses } = require('./dev-cleanup.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const root = '/work/human';
test('zombies are already exited; live same-generation processes still block cleanup', () => {
  const rows = parseSnapshot([
    '47876 47865 Z Fri Nov 13 23:11:49 2026 <defunct>',
    '48041 47882 S Fri Nov 13 23:11:50 2026 node /work/human/apps/backend/dist/main',
    '48042 47882 S Fri Nov 13 23:11:51 2026 node worker.js',
  ].join('\n'));
  const originals = new Map([[47876, rows[0].started], [48041, rows[1].started], [48042, 'old generation']]);
  assert.deepEqual(pendingProcesses(rows, originals).map(r => r.pid), [48041]);
});
test('Electron cleanup finds orphan app, launcher and helpers without ports', () => {
  const rows = [
    { pid: 10, ppid: 1, command: `${root}/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .`, cwd: `${root}/apps/body` },
    { pid: 11, ppid: 10, command: 'Electron Helper' },
    { pid: 12, ppid: 1, command: 'node node_modules/.bin/electron-vite dev', cwd: `${root}/apps/body` },
    { pid: 13, ppid: 1, command: '/other/node_modules/electron/dist/Electron .', cwd: '/other' },
  ];
  assert.deepEqual([...selectProcesses(rows, root, 'electron')].sort((a,b)=>a-b), [10,11,12]);
});
test('backend cleanup includes watch parent and descendants, excludes clients and other projects', () => {
  const rows = [
    { pid: 20, ppid: 1, command: `node ${root}/apps/backend/node_modules/.bin/nest start --watch`, cwd: root },
    { pid: 21, ppid: 20, command: `node ${root}/apps/backend/dist/main` },
    { pid: 22, ppid: 21, command: 'python worker.py' },
    { pid: 23, ppid: 1, command: 'node client.js', cwd: root },
    { pid: 24, ppid: 1, command: 'node /work/human-other/apps/backend/dist/main', cwd: '/work/human-other' },
  ];
  assert.deepEqual([...selectProcesses(rows, root, 'backend')].sort((a,b)=>a-b), [20,21,22]);
});
test('Python reload supervisor is selected only from this service directory', () => {
  const rows = [
    { pid: 30, ppid: 1, command: 'python -m uvicorn main:app --reload', cwd: `${root}/apps/python-service` },
    { pid: 31, ppid: 30, command: 'python -c multiprocessing.spawn' },
    { pid: 32, ppid: 1, command: 'python -m uvicorn main:app --reload', cwd: '/other' },
  ];
  assert.deepEqual([...selectProcesses(rows, root, 'python')], [30,31]);
});

test('real cleanup releases own listener and refuses a foreign listener', { skip: process.platform === 'win32', timeout: 15000 }, async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'human-cleanup-'));
  const ownDir = path.join(fixture, 'apps/backend/dist');
  fs.mkdirSync(ownDir, { recursive: true });
  const script = path.join(ownDir, 'main.js');
  fs.writeFileSync(script, "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>console.log(s.address().port));");
  const child = spawn(process.execPath, [script], { cwd: fixture, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  try {
    const port = Number(String((await once(child.stdout, 'data'))[0]).trim());
    await assert.rejects(cleanup('backend', { root: fixture + '-other', ports: [port] }), /非本服务进程/);
    assert.equal(child.exitCode, null);
    await cleanup('backend', { root: fixture, ports: [port] });
    await exited;
    assert.ok(child.signalCode);
    // Empty service is a successful no-op.
    await cleanup('backend', { root: fixture, ports: [port] });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
