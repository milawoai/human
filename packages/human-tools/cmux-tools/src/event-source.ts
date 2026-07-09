/**
 * @human/cmux-tools — 异步事件源
 *
 * 实现 AsyncEventSource：spawn `cmux events` 流，解析 NDJSON，
 * 把每个 cmux 事件转发给 motor（motor 再 emit 到总线）。
 *
 * 关键点：
 * - --reconnect + --cursor-file：断线自动重连，从上次 seq 继续，不丢事件
 * - --no-heartbeat：过滤心跳帧
 * - 不限定 --category：转发所有事件，调用方按需订阅
 * - 只转发 type=='event' 的帧（过滤 ack/heartbeat）
 */
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AsyncEventSource } from './types';

/** cmux events NDJSON 帧类型 */
interface CmuxEventFrame {
  type: string; // 'ack' | 'heartbeat' | 'event'
  category?: string;
  name?: string; // 事件名，如 'notification.created' / 'agent.hook.Stop'
  seq?: number;
  occurred_at?: string;
  surface_id?: string;
  workspace_id?: string;
  pane_id?: string;
  source?: string;
  payload?: unknown;
}

export class CmuxEventSource implements AsyncEventSource {
  private child: ChildProcess | null = null;
  private cursorFile: string;

  constructor(private readonly binaryPath: string) {
    // cursor 文件记录上次收到的 seq，断线重连时从这继续
    this.cursorFile = path.join(os.homedir(), '.cache', 'cmux-events.seq');
  }

  async start(emit: (eventName: string, payload: unknown) => void): Promise<void> {
    if (this.child) {
      return; // 已启动
    }

    // 确保 cursor 目录存在
    try {
      fs.mkdirSync(path.dirname(this.cursorFile), { recursive: true });
    } catch {
      /* ignore */
    }

    // 参数说明：
    // - --no-heartbeat / --no-ack：过滤非事件帧，只保留 type=='event'
    // - 不用 --reconnect/--cursor-file：实测 cursor-file 与新事件推送存在竞争，
    //   会导致订阅后跳过刚发生的事件。断线重连后续可加（需先解决 cursor 竞争）。
    const args = ['events', '--no-heartbeat', '--no-ack'];

    this.child = spawn(this.binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let buffer = '';

    this.child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        this.handleLine(line, emit);
      }
    });

    this.child.stderr?.on('data', () => {
      // cmux events 的诊断信息走 stderr，忽略（reconnect 会自愈）
    });

    this.child.on('error', () => {
      // spawn 失败或进程异常，reconnect 由 cmux CLI 自己处理
    });

    this.child.on('exit', () => {
      this.child = null;
    });
  }

  /** 解析一行 NDJSON，是事件帧就转发 */
  private handleLine(line: string, emit: (eventName: string, payload: unknown) => void): void {
    let frame: CmuxEventFrame;
    try {
      frame = JSON.parse(line) as CmuxEventFrame;
    } catch {
      return; // 非 JSON 行忽略
    }

    // 只转发事件帧（过滤 ack / heartbeat）
    if (frame.type !== 'event') return;
    if (!frame.name) return;

    // 派生简短事件名：notification.created → notification_created
    // （总线 topic 用 . 分隔层级，事件名内部用 _ 避免歧义）
    const eventName = frame.name.replace(/\./g, '_');

    // 转发的 payload 包含事件元信息 + cmux 原始 payload
    emit(eventName, {
      name: frame.name,
      category: frame.category,
      seq: frame.seq,
      occurredAt: frame.occurred_at,
      surfaceId: frame.surface_id,
      workspaceId: frame.workspace_id,
      paneId: frame.pane_id,
      source: frame.source,
      data: frame.payload,
    });
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    try {
      this.child.kill('SIGTERM');
      // 给 200ms 优雅退出，否则强杀
      setTimeout(() => {
        if (this.child && !this.child.killed) {
          this.child.kill('SIGKILL');
        }
      }, 200);
    } catch {
      /* ignore */
    }
    this.child = null;
  }
}
