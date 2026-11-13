// VS Code preLaunchTask: clean only this workspace's development processes.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const roles = {
  backend: { ports: [12002, 9229], pattern: /(?:\bnest\s+start\b|[/\\]dist[/\\]main(?:\.js)?(?:\s|$)|\bworkspace\s+backend\s+(?:start|dev))/ },
  python: { ports: [12003], pattern: /\buvicorn\b/ },
  electron: { ports: [12001, 5200, 5858, 9222], pattern: /(?:electron-vite|[/\\]Electron(?:\s|$)|[/\\]electron(?:\s|$)|\bworkspace\s+electron_with_serve\s+dev)/ },
};

function selectProcesses(rows, root, role) {
  const selected = new Set();
  const dir = path.join(root, 'apps', role === 'electron' ? 'body' : role === 'python' ? 'python-service' : 'backend');
  for (const row of rows) {
    const scoped = row.command.includes(`${dir}/`) || row.cwd === dir || row.cwd === root;
    const electronBinary = role === 'electron' && row.command.includes(`${root}/node_modules/electron/`);
    if (electronBinary || (scoped && roles[role].pattern.test(row.command))) selected.add(row.pid);
  }
  // Include worker/helper children, including those not bound to a port.
  let changed;
  do {
    changed = false;
    for (const row of rows) if (selected.has(row.ppid) && !selected.has(row.pid)) {
      selected.add(row.pid);
      changed = true;
    }
  } while (changed);
  return selected;
}

function command(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}
function snapshot() {
  return command('ps', ['-axo', 'pid=,ppid=,lstart=,command=']).split('\n').flatMap(line => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.+)$/);
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), started: m[3], command: m[4] }] : [];
  });
}
function lsof(args) {
  try { return command('lsof', args); }
  catch (error) {
    if (error.status === 1 && !String(error.stderr || '').trim()) return '';
    throw error;
  }
}
function cwd(pid) {
  return lsof(['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).split('\n').find(s => s.startsWith('n'))?.slice(1);
}
function listeners(ports) {
  return new Set(ports.flatMap(port => lsof(['-nP', '-a', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .trim().split(/\s+/).filter(Boolean).map(Number)));
}

async function cleanup(role, { root = path.resolve(__dirname, '..'), dryRun = false, ports = roles[role]?.ports } = {}) {
  if (!roles[role]) throw new Error(`Unknown service: ${role}`);
  if (process.platform === 'win32') throw new Error('此清理脚本需要 macOS/Linux 的 ps 和 lsof；Windows 尚未支持。');
  const rows = snapshot();
  const portPids = listeners(ports);
  for (const row of rows) {
    if (portPids.has(row.pid) || roles[role].pattern.test(row.command)) row.cwd = cwd(row.pid);
  }
  const selected = selectProcesses(rows, root, role);
  // Never terminate this task or its own launch/debugger ancestry.
  let parent = process.pid;
  while (parent > 1) {
    selected.delete(parent);
    parent = rows.find(r => r.pid === parent)?.ppid || 0;
  }
  const foreign = [...portPids].filter(pid => !selected.has(pid));
  if (foreign.length) throw new Error(`${role}: 端口被非本服务进程占用（PID ${foreign.join(', ')}），未终止任何进程。`);
  console.log(`[dev-cleanup] ${role}: ${dryRun ? '将关闭' : '关闭'} PID ${[...selected].join(', ') || '无'}; ports=${ports.join(',')}`);
  if (dryRun) return;
  const originals = new Map(rows.filter(r => selected.has(r.pid)).map(r => [r.pid, r.started]));
  const remaining = () => snapshot().filter(r => originals.get(r.pid) === r.started);
  const signal = (rowsToStop, sig) => {
    for (const row of rowsToStop) {
      try { process.kill(row.pid, sig); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  signal(remaining(), 'SIGTERM');
  const deadline = Date.now() + 3000;
  while (remaining().length && Date.now() < deadline) await delay(100);
  const stubborn = remaining();
  if (stubborn.length) {
    console.log(`[dev-cleanup] ${role}: SIGKILL PID ${stubborn.map(r => r.pid).join(', ')}`);
    signal(stubborn, 'SIGKILL');
  }
  const finalDeadline = Date.now() + 2000;
  while ((remaining().length || listeners(ports).size) && Date.now() < finalDeadline) await delay(100);
  if (remaining().length || listeners(ports).size) throw new Error(`${role}: 清理未完成，请检查残留进程/自动重启的服务。`);
}

module.exports = { selectProcesses, cleanup };
if (require.main === module) {
  const role = process.argv[2];
  (async () => {
    for (const item of role === 'all' ? Object.keys(roles) : [role]) await cleanup(item, { dryRun: process.argv.includes('--dry-run') });
  })().catch(error => { console.error(`[dev-cleanup] ${error.message}`); process.exitCode = 1; });
}
