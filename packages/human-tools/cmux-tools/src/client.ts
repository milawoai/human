/**
 * @human/cmux-tools — CmuxClient 传输层
 *
 * 封装 cmux 的两种控制通道：
 * - CLI：spawn `cmux <command>` 子进程
 * - Socket：连接 Unix socket，NDJSON 协议
 *
 * 提供：
 * - 三态健康探测（安装/运行/allowAll）
 * - 统一 call() 入口，自动选择传输方式
 * - socket 长连接生命周期管理（懒加载、空闲关闭、broken pipe 自愈）
 */
import { spawn } from 'child_process';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  CmuxClientConfig,
  CmuxHealthState,
  CmuxCallResult,
  CmuxSocketRequest,
  CmuxSocketResponse,
  TransportHint,
  DEFAULT_CONFIG,
  DEFAULT_BINARY_PATH,
  SOCKET_PREFERRED,
  JSON_COMMANDS,
  CmuxErrorCodes,
} from './types';

/** 轻量日志接口（不依赖 @nestjs/common，保持包独立） */
export interface CmuxLogger {
  debug(msg: string): void;
  log(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** 默认无操作日志（包内不打印，由 provider 注入实际 logger） */
const noopLogger: CmuxLogger = {
  debug: () => {},
  log: () => {},
  warn: () => {},
  error: () => {},
};

/** pending socket 请求 */
interface PendingRequest {
  resolve: (r: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * CmuxClient —— 普通类（非 NestJS Injectable），由 CmuxProvider 持有。
 *
 * 一个 client 实例对应一个 cmux 工具实例，内部维护一条 socket 长连接
 * （懒加载、空闲超时关闭、断开自愈）。
 */
export class CmuxClient {
  private config: CmuxClientConfig = { ...DEFAULT_CONFIG };
  private logger: CmuxLogger = noopLogger;

  /** socket 长连接 */
  private socket: net.Socket | null = null;
  /** 防并发连接 */
  private connecting: Promise<net.Socket> | null = null;
  /** NDJSON 帧解析缓冲 */
  private rxBuffer = '';
  /** pending 请求表 */
  private pending = new Map<string, PendingRequest>();
  /** 自增请求 id */
  private nextId = 1;
  /** 空闲关闭定时器 */
  private idleTimer: NodeJS.Timeout | null = null;

  /** 健康状态缓存 */
  private health: CmuxHealthState = {
    installed: false,
    running: false,
    allowAll: false,
    binaryPath: DEFAULT_BINARY_PATH,
    lastChecked: 0,
  };

  /** 注入运行时配置覆盖（undefined 值不覆盖默认值） */
  configure(override: Partial<CmuxClientConfig>): void {
    const cleaned: Partial<CmuxClientConfig> = {};
    for (const [k, v] of Object.entries(override)) {
      if (v !== undefined) (cleaned as Record<string, unknown>)[k] = v;
    }
    this.config = { ...this.config, ...cleaned };
    this.health.binaryPath = this.config.binaryPath;
  }

  /** 注入 logger */
  setLogger(logger: CmuxLogger): void {
    this.logger = logger;
  }

  // ──────────────────────────────────────────────
  // 健康探测
  // ──────────────────────────────────────────────

  /** 完整三态探测（带缓存） */
  async probeHealth(force = false): Promise<CmuxHealthState> {
    if (!force && Date.now() - this.health.lastChecked < this.config.healthTtlMs) {
      return this.health;
    }

    const state: CmuxHealthState = {
      installed: false,
      running: false,
      allowAll: false,
      binaryPath: this.config.binaryPath,
      lastChecked: Date.now(),
    };

    // 1) 安装检测：文件存在且可执行
    try {
      const st = fs.statSync(this.config.binaryPath);
      state.installed = st.isFile() && (st.mode & 0o111) !== 0;
    } catch {
      state.installed = false;
    }
    if (!state.installed) {
      this.health = state;
      return state;
    }

    // 2) 运行检测：探测 socket 路径 + CLI ping
    state.socketPath = await this.resolveSocketPath();
    if (state.socketPath) {
      try {
        const pong = await this.cliExec(['ping'], 2000);
        // ping 实测返回纯文本 "PONG"
        state.running = pong.stdout.trim() === 'PONG' || pong.exitCode === 0;
      } catch {
        state.running = false;
      }
    }

    // 3) allowAll 检测：仅 CLI capabilities 返回 access_mode
    if (state.running) {
      try {
        const caps = await this.cliExec(['capabilities', '--json'], 2000);
        const parsed = JSON.parse(caps.stdout.trim()) as { access_mode?: string };
        state.accessMode = parsed.access_mode;
        state.allowAll = parsed.access_mode === 'allowAll';
      } catch {
        state.allowAll = false;
      }
    }

    this.health = state;
    this.logger.debug(`cmux health probe: ${JSON.stringify(state)}`);
    return state;
  }

  /** 轻量门禁（读缓存，缓存过期则建议 probe）。不主动 probe，避免高频开销 */
  quickGate(): { ok: boolean; code?: string; message?: string; details?: unknown } {
    const h = this.health;
    if (!h.installed) {
      return {
        ok: false,
        code: CmuxErrorCodes.NOT_INSTALLED,
        message: `cmux 未安装或不可执行: ${this.config.binaryPath}`,
        details: { binaryPath: this.config.binaryPath },
      };
    }
    if (!h.running) {
      return {
        ok: false,
        code: CmuxErrorCodes.NOT_RUNNING,
        message: 'cmux 未运行或 socket 不可达',
        details: { socketPath: h.socketPath },
      };
    }
    if (!h.allowAll) {
      return {
        ok: false,
        code: CmuxErrorCodes.NOT_ALLOWALL,
        message:
          'cmux 访问模式非 allowAll，外部进程被拒绝。请到 Human app 设置面板开启 cmux allowAll。',
        details: { accessMode: h.accessMode },
      };
    }
    return { ok: true };
  }

  /** 解析当前 socket 路径：env > config > last-socket-path 文件 > 默认 */
  private async resolveSocketPath(): Promise<string | undefined> {
    if (process.env.CMUX_SOCKET_PATH) return process.env.CMUX_SOCKET_PATH;
    if (this.config.socketPath) return this.config.socketPath;

    const cmuxStateDir = path.join(os.homedir(), '.local/state/cmux');
    const lastPathFile = path.join(cmuxStateDir, 'last-socket-path');
    try {
      const p = fs.readFileSync(lastPathFile, 'utf-8').trim();
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
    const defaultPath = path.join(cmuxStateDir, 'cmux.sock');
    return fs.existsSync(defaultPath) ? defaultPath : undefined;
  }

  // ──────────────────────────────────────────────
  // CLI 传输
  // ──────────────────────────────────────────────

  /** 执行 CLI 子命令，返回 stdout/stderr/exitCode */
  cliExec(args: string[], timeoutMs?: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const timeout = timeoutMs ?? this.config.cliTimeoutMs;
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
        reject(new Error(`cmux CLI 超时 (${timeout}ms): cmux ${args.join(' ')}`));
      }, timeout);

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: code ?? -1 });
      });
    });
  }

  /** 执行并解析 JSON（args 应已含 --json） */
  async cliExecJson<T = unknown>(args: string[], timeoutMs?: number): Promise<T> {
    const r = await this.cliExec(args, timeoutMs);
    if (r.exitCode !== 0) {
      throw new Error(r.stderr.trim() || `cmux 命令失败 (exit ${r.exitCode}): ${r.stdout.trim()}`);
    }
    const text = r.stdout.trim();
    try {
      return JSON.parse(text) as T;
    } catch {
      // 像 ping 这种"伪 --json"返回纯文本，原样返回
      return text as unknown as T;
    }
  }

  // ──────────────────────────────────────────────
  // Socket 传输（NDJSON 长连接）
  // ──────────────────────────────────────────────

  /** 获取/建立 socket 连接（懒加载 + 防并发） */
  private async getSocket(): Promise<net.Socket> {
    if (this.socket && !this.socket.destroyed && this.socket.writable) {
      this.resetIdleTimer();
      return this.socket;
    }
    if (this.connecting) return this.connecting;
    this.connecting = this.connectSocket();
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async connectSocket(): Promise<net.Socket> {
    const socketPath = await this.resolveSocketPath();
    if (!socketPath) {
      throw new Error('cmux socket 路径未找到，cmux 可能未运行');
    }
    if (!fs.existsSync(socketPath)) {
      throw new Error(`cmux socket 不存在: ${socketPath}`);
    }
    return new Promise<net.Socket>((resolve, reject) => {
      const sock = net.createConnection({ path: socketPath });
      const connectTimer = setTimeout(() => {
        sock.destroy();
        reject(new Error(`cmux socket 连接超时 (${this.config.socketConnectTimeoutMs}ms)`));
      }, this.config.socketConnectTimeoutMs);

      sock.setEncoding('utf-8');
      sock.once('connect', () => {
        clearTimeout(connectTimer);
        sock.on('data', (chunk: string) => this.onSocketData(chunk));
        sock.on('error', (err) => this.onSocketError(err));
        sock.on('close', () => this.onSocketClose());
        this.socket = sock;
        this.logger.debug(`cmux socket 已连接: ${socketPath}`);
        this.resetIdleTimer();
        resolve(sock);
      });
      sock.once('error', (err) => {
        clearTimeout(connectTimer);
        reject(err);
      });
    });
  }

  /** 发送一个 NDJSON 请求 */
  socketCall<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.getSocket().then(
      (sock) =>
        new Promise<T>((resolve, reject) => {
          const id = String(this.nextId++);
          const req: CmuxSocketRequest = { id, method, params };
          const line = JSON.stringify(req) + '\n';

          const timer = setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`cmux socket 请求超时 (${this.config.socketRequestTimeoutMs}ms): ${method}`));
          }, this.config.socketRequestTimeoutMs);

          this.pending.set(id, {
            resolve: (r) => {
              clearTimeout(timer);
              this.resetIdleTimer();
              resolve(r as T);
            },
            reject: (e) => {
              clearTimeout(timer);
              this.resetIdleTimer();
              reject(e);
            },
            timer,
          });

          // 写失败 → 由 onSocketError/onClose 兜底 reject 所有 pending
          sock.write(line);
        }),
    );
  }

  /** NDJSON 帧切分与分发 */
  private onSocketData(chunk: string): void {
    this.rxBuffer += chunk;
    let nl: number;
    while ((nl = this.rxBuffer.indexOf('\n')) >= 0) {
      const line = this.rxBuffer.slice(0, nl).trim();
      this.rxBuffer = this.rxBuffer.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as CmuxSocketResponse;
        const p = this.pending.get(String(msg.id));
        if (!p) continue; // 已超时被清理
        this.pending.delete(String(msg.id));
        if (msg.ok) {
          p.resolve(msg.result);
        } else {
          p.reject(
            new Error(msg.error?.message || 'cmux socket error'),
          );
        }
      } catch {
        this.logger.warn(`cmux socket 收到非 JSON 帧: ${line.slice(0, 100)}`);
      }
    }
  }

  private onSocketError(err: Error): void {
    this.logger.warn(`cmux socket error: ${err.message}`);
    this.failAllPending(err);
  }

  private onSocketClose(): void {
    if (this.socket) {
      this.logger.debug('cmux socket 已关闭');
    }
    this.socket = null;
    this.rxBuffer = '';
    this.failAllPending(new Error('cmux socket 已断开'));
  }

  private failAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  /** 空闲超时关闭 socket（省 fd） */
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (!this.config.socketIdleTimeoutMs) return;
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0 && this.socket) {
        this.logger.debug('cmux socket 空闲超时，关闭');
        this.socket.end();
        this.socket = null;
      }
    }, this.config.socketIdleTimeoutMs);
  }

  // ──────────────────────────────────────────────
  // 统一调用入口（自动选择传输）
  // ──────────────────────────────────────────────

  /**
   * 统一调用入口 —— 调用方无感。
   *
   * @param command CLI 命令名（如 'workspace.list' 用 '.' 分隔子命令，或 'send'）
   * @param params  参数
   * @param opts    传输提示与是否期望 JSON
   *
   * 选择规则：
   * - socket 强制 socket；失败不降级（socket 挂了 CLI 通常也挂）
   * - cli 强制 CLI
   * - auto：SOCKET_PREFERRED 命令（read-screen/send 等）走 socket，失败降级 CLI；其余走 CLI
   */
  async call(
    command: string,
    params: Record<string, unknown>,
    opts: { transport?: TransportHint; expectJson?: boolean } = {},
  ): Promise<CmuxCallResult> {
    const transport = opts.transport ?? 'auto';
    const useSocket =
      this.config.socketEnabled &&
      (transport === 'socket' || (transport === 'auto' && SOCKET_PREFERRED.has(command)));

    if (useSocket) {
      try {
        // CLI 命令名 → socket method 名
        const method = this.commandToSocketMethod(command);
        const result = await this.socketCall(method, params);
        return { ok: true, data: result };
      } catch (e) {
        if (transport === 'socket') {
          return { ok: false, error: { code: CmuxErrorCodes.SOCKET_ERROR, message: errMsg(e) } };
        }
        this.logger.warn(`cmux socket 调用 ${command} 失败，降级 CLI: ${errMsg(e)}`);
      }
    }

    // CLI 路径
    const args = this.commandToCliArgs(command, params);
    const expectJson = opts.expectJson ?? JSON_COMMANDS.has(command);
    try {
      if (expectJson) {
        const data = await this.cliExecJson(args);
        return { ok: true, data };
      }
      const r = await this.cliExec(args);
      if (r.exitCode !== 0) {
        return {
          ok: false,
          error: {
            code: CmuxErrorCodes.CLI_ERROR,
            message: r.stderr.trim() || `cmux 命令失败 (exit ${r.exitCode})`,
            raw: r,
          },
        };
      }
      return { ok: true, data: r.stdout.trim() };
    } catch (e) {
      return { ok: false, error: { code: CmuxErrorCodes.CLI_ERROR, message: errMsg(e) } };
    }
  }

  /** CLI 命令名 → socket method 名（含子命令展开） */
  private commandToSocketMethod(command: string): string {
    // workspace.list → workspace.list（socket 同形）
    // send → surface.send_text
    // current-workspace → workspace.current
    const map: Record<string, string> = {
      send: 'surface.send_text',
      'send-key': 'surface.send_key',
      'read-screen': 'surface.read_text',
      notify: 'notification.create',
      'current-workspace': 'workspace.current',
      'list-surfaces': 'surface.list',
      'list-panes': 'pane.list',
      capabilities: 'system.capabilities',
      identify: 'system.identify',
      ping: 'system.ping',
    };
    return map[command] ?? command;
  }

  /** CLI 命令名 + params → CLI args 数组 */
  private commandToCliArgs(command: string, params: Record<string, unknown>): string[] {
    // workspace.list → ['workspace', 'list']
    // send → ['send']
    const parts = command.split('.');
    const args: string[] = [...parts];

    const pushFlag = (flag: string, key: string) => {
      if (params[key] != null) {
        args.push(flag, String(params[key]));
      }
    };

    pushFlag('--workspace', 'workspace');
    pushFlag('--surface', 'surface');
    pushFlag('--window', 'window');
    pushFlag('--lines', 'lines');
    pushFlag('--title', 'title');
    pushFlag('--body', 'body');
    pushFlag('--subtitle', 'subtitle');
    pushFlag('--name', 'name');
    pushFlag('--cwd', 'cwd');

    if (params.scrollback === true) args.push('--scrollback');

    if (JSON_COMMANDS.has(command) && !args.includes('--json')) {
      args.push('--json');
    }

    // 位置参数：text / key（放最后）
    if (params.text != null) args.push(String(params.text));
    if (params.key != null && command === 'send-key') args.push(String(params.key));

    return args;
  }

  /** 关闭客户端，释放 socket */
  async close(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.failAllPending(new Error('client closed'));
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
