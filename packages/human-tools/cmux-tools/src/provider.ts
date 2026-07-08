/**
 * @human/cmux-tools — Provider 与 ToolInstance
 *
 * CmuxProvider 实现 BuiltinToolProvider 契约（结构对齐 motor），
 * 由 motor 的 tool-registry 通过 dynamicImport 加载本包后调用 createInstance。
 *
 * CmuxToolInstance：
 * - initialize：首次三态自检，决定状态（未就绪不抛错，降级 ready 让 check_health 可调）
 * - start/stop：拉起/退出 cmux 应用（start 固定以 allowAll 模式启动）
 * - execute：入口门禁（quickGate），通过后分发到 capabilities
 * - destroy：释放 socket
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CmuxClient, CmuxLogger } from './client';
import { dispatchCapability } from './capabilities';
import {
  BuiltinToolProvider,
  ToolDescriptor,
  ToolInstance,
  ToolResult,
  ToolStatus,
  ToolContext,
} from './types';

const execAsync = promisify(exec);

/** 简单 console logger 实现（包默认；motor 侧可通过 setLogger 覆盖） */
const consoleLogger: CmuxLogger = {
  debug: (m) => console.debug(`[cmux-tools] ${m}`),
  log: (m) => console.log(`[cmux-tools] ${m}`),
  warn: (m) => console.warn(`[cmux-tools] ${m}`),
  error: (m) => console.error(`[cmux-tools] ${m}`),
};

/** cmux.app 默认路径 */
const DEFAULT_APP_PATH = '/Applications/cmux.app';

/** 启动后等待 cmux 就绪的最大毫秒数 */
const START_READY_TIMEOUT_MS = 15000;
/** 启动后轮询健康状态的间隔 */
const START_POLL_INTERVAL_MS = 1000;

export class CmuxProvider implements BuiltinToolProvider {
  readonly providerId = 'cmux';
  private readonly logger: CmuxLogger = consoleLogger;

  createInstance(descriptor: ToolDescriptor): ToolInstance {
    const client = new CmuxClient();
    // 把 descriptor.config（cmux.json 的 config 字段）注入 client
    const cfg = (descriptor.config || {}) as Record<string, unknown>;
    client.configure({
      binaryPath: (cfg.binaryPath as string) || undefined,
      socketPath: (cfg.socketPath as string) || undefined,
      socketEnabled: cfg.socketEnabled !== false,
      cliTimeoutMs: cfg.cliTimeoutMs as number | undefined,
      socketIdleTimeoutMs: cfg.socketIdleTimeoutMs as number | undefined,
    });
    client.setLogger(this.logger);
    const appPath = (cfg.appPath as string) || DEFAULT_APP_PATH;
    return new CmuxToolInstance(descriptor, client, this.logger, appPath);
  }
}

class CmuxToolInstance implements ToolInstance {
  status: ToolStatus = 'idle';
  private healthChecked = false;

  constructor(
    readonly descriptor: ToolDescriptor,
    private readonly client: CmuxClient,
    private readonly logger: CmuxLogger,
    private readonly appPath: string,
  ) {}

  async initialize(): Promise<void> {
    this.status = 'initializing';
    try {
      const health = await this.client.probeHealth(true);
      this.healthChecked = true;
      this.logger.log(
        `cmux 初始化自检: installed=${health.installed} running=${health.running} allowAll=${health.allowAll}`,
      );
      if (!health.installed) {
        this.logger.warn(`cmux 未安装或不可执行: ${health.binaryPath}`);
      } else if (!health.running) {
        this.logger.warn('cmux 未运行，工具将返回 CMUX_NOT_RUNNING 直到 cmux 启动');
      } else if (!health.allowAll) {
        this.logger.warn(
          'cmux 访问模式非 allowAll，外部进程无法调用。可通过 motor.tool.start 重启到 allowAll。',
        );
      }
    } catch (e) {
      this.logger.error(`cmux 初始化自检异常: ${e instanceof Error ? e.message : String(e)}`);
    }
    // 始终置 ready：未就绪由 execute 入口门禁拦截，让 check_health 仍可调用
    this.status = 'ready';
  }

  /**
   * 启动 cmux 应用（确保 allowAll 模式）。
   *
   * 职责边界（实测确认：socketControlMode 不能通过 reload 热切，listener 启动时定）：
   * - 未安装 → 失败 + nextSteps（安装指引）
   * - 已运行且 allowAll → 直接返回成功（alreadyRunning）
   * - 已运行但非 allowAll → 失败 + nextSteps（交用户在 GUI/手动改，因重启 cmux 才能切）
   * - 未运行 → 持久化 cmux.json 的 socketControlMode=allowAll（确保以后每次启动都 allowAll）
   *              + 以 CMUX_SOCKET_MODE=allowAll 启动（本次立即 allowAll）+ 轮询等待就绪
   *              失败 → 返回 nextSteps（手动启动命令）
   *
   * 所有失败分支都返回 data.nextSteps：结构化的用户可执行操作，
   * 让调用方（brain / UI）能展示给用户自行处理。
   */
  async start(options?: { force?: boolean }): Promise<ToolResult> {
    this.logger.log(`启动 cmux (force=${options?.force === true})`);

    // 先检测当前状态
    const before = await this.client.probeHealth(true);
    if (!before.installed) {
      return {
        success: false,
        error: {
          code: 'CMUX_NOT_INSTALLED',
          message: `cmux 未安装或不可执行: ${before.binaryPath}`,
        },
        data: {
          nextSteps: [
            { action: 'install', description: '安装 cmux.app', command: 'brew install --cask cmux' },
          ],
        },
      };
    }

    // 已运行：根据 allowAll 决定
    if (before.running) {
      if (before.allowAll) {
        return {
          success: true,
          data: { started: false, alreadyRunning: true, allowAll: true },
        };
      }
      // 已运行但非 allowAll：reload 不能热切（listener 启动时定），交用户处理
      return {
        success: false,
        error: {
          code: 'CMUX_NOT_ALLOWALL',
          message: 'cmux 已运行但非 allowAll 模式，外部进程无法调用。需重启 cmux 才能切换（reload 不生效）。',
          details: { accessMode: before.accessMode },
        },
        data: {
          nextSteps: this.buildSwitchModeSteps(),
        },
      };
    }

    // 未运行：持久化 allowAll 配置（确保以后每次启动都 allowAll）
    const persisted = this.persistAllowAllConfig();
    if (!persisted.ok) {
      this.logger.warn(`持久化 allowAll 配置失败（不影响本次启动）: ${persisted.error}`);
    }

    // 以 allowAll 启动
    try {
      await execAsync(`CMUX_SOCKET_MODE=allowAll open -a "${this.appPath}"`);
    } catch (e) {
      return {
        success: false,
        error: {
          code: 'CMUX_EXECUTION_ERROR',
          message: `启动 cmux 失败: ${e instanceof Error ? e.message : String(e)}`,
        },
        data: {
          nextSteps: [
            {
              action: 'start_manually',
              description: '手动启动 cmux（带 allowAll）',
              command: `CMUX_SOCKET_MODE=allowAll open -a "${this.appPath}"`,
            },
          ],
        },
      };
    }

    // 轮询等待 cmux 就绪（allowAll 生效）
    const ready = await this.waitForReady();
    if (!ready) {
      return {
        success: false,
        error: {
          code: 'CMUX_NOT_RUNNING',
          message: `cmux 启动后 ${START_READY_TIMEOUT_MS}ms 内未就绪`,
        },
        data: {
          nextSteps: [
            {
              action: 'check_manually',
              description: '手动检查 cmux 是否启动成功',
              command: `${before.binaryPath} capabilities --json`,
            },
            {
              action: 'start_manually',
              description: '若 cmux 未启动，手动启动',
              command: `CMUX_SOCKET_MODE=allowAll open -a "${this.appPath}"`,
            },
          ],
        },
      };
    }
    return {
      success: true,
      data: {
        started: true,
        alreadyRunning: false,
        allowAll: true,
        configPersisted: persisted.ok,
      },
    };
  }

  /**
   * 构建"切换到 allowAll 模式"的用户操作步骤。
   *
   * reload 不能热切 socketControlMode（实测），只能重启 cmux 让 listener 重建。
   * 提供两条路径：GUI 设置（推荐，无命令）/ 手动改配置+重启。
   */
  private buildSwitchModeSteps(): Array<{ action: string; description: string; command?: string }> {
    return [
      {
        action: 'gui_settings',
        description: '在 cmux 里打开 Settings > Automation > Socket control mode，选 allowAll（需重启 cmux 生效）',
      },
      {
        action: 'manual_config_and_restart',
        description: '或手动改配置后重启 cmux',
        command: `osascript -e 'tell application "${this.appPath}" to quit' && sleep 2 && CMUX_SOCKET_MODE=allowAll open -a "${this.appPath}"`,
      },
      {
        action: 'verify',
        description: '重启后验证模式已切换',
        command: 'cmux capabilities --json',
      },
    ];
  }

  /**
   * 持久化 cmux.json 的 automation.socketControlMode=allowAll。
   *
   * 这样用户以后每次正常启动 cmux 都自动 allowAll，不依赖启动时的环境变量。
   * 仅在文件可写时操作，失败不阻断启动（返回 ok:false + error）。
   */
  private persistAllowAllConfig(): { ok: boolean; error?: string } {
    const cmuxJsonPath = path.join(os.homedir(), '.config/cmux/cmux.json');
    let content: string;
    try {
      content = fs.readFileSync(cmuxJsonPath, 'utf-8');
    } catch {
      // 文件不存在 → 创建最小配置
      content =
        '{\n  "$schema": "https://raw.githubusercontent.com/manaflow-ai/cmux/main/web/data/cmux.schema.json",\n  "schemaVersion": 1\n}\n';
      try {
        fs.mkdirSync(path.dirname(cmuxJsonPath), { recursive: true });
      } catch (e) {
        return { ok: false, error: `无法创建 cmux.json 目录: ${errMsg(e)}` };
      }
    }

    const newContent = this.setSocketControlMode(content, 'allowAll');
    if (newContent === content) {
      return { ok: true }; // 已是 allowAll，无需改
    }
    try {
      fs.writeFileSync(cmuxJsonPath, newContent, 'utf-8');
      this.logger.log('已持久化 cmux.json: automation.socketControlMode=allowAll');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `无法写入 cmux.json: ${errMsg(e)}` };
    }
  }

  /**
   * 在 cmux.json 内容里设置 automation.socketControlMode（JSONC 兼容）。
   *
   * cmux.json 默认模板里 automation 整段可能不存在或被注释。
   * 采用「整段替换/插入」策略，避免破坏 JSONC 嵌套结构：
   * 1. 已有未注释的 socketControlMode → 替换值
   * 2. 有注释的 automation 段 → 整段替换为干净的未注释 automation 段
   * 3. 有未注释的 automation 段但无 socketControlMode → 在段内插入
   * 4. 无 automation 段 → 在最后 } 前新建
   *
   * 返回新内容；若无需改动返回原内容（幂等）。
   */
  private setSocketControlMode(content: string, mode: string): string {
    const newAutomationBlock = `  "automation": {\n    "socketControlMode": "${mode}"\n  }`;

    // 1. 已有未注释的 socketControlMode（automation 段内）→ 替换值
    const activeRe = /"socketControlMode"\s*:\s*"[^"]*"/;
    const lines = content.split('\n');
    const idx = lines.findIndex((l) => activeRe.test(l) && !l.trim().startsWith('//'));
    if (idx >= 0) {
      lines[idx] = lines[idx].replace(activeRe, `"socketControlMode": "${mode}"`);
      return lines.join('\n');
    }

    // 2. 有注释的 automation 段 → 整段替换
    const commentedBlockRe = /\n[ \t]*\/\/\s*"automation"\s*:\s*\{[\s\S]*?\/\/\s*\},?/;
    if (commentedBlockRe.test(content)) {
      return content.replace(commentedBlockRe, `\n${newAutomationBlock},`);
    }

    // 3. 有未注释的 automation 段 → 在段内第一个字段前插入
    if (/[ \t]*"automation"\s*:\s*\{/.test(content)) {
      return content.replace(
        /([ \t]*"automation"\s*:\s*\{)/,
        `$1\n    "socketControlMode": "${mode}",`,
      );
    }

    // 4. 无 automation 段 → 在最后 } 前插入
    return content.replace(/\n?\}\s*$/, `\n${newAutomationBlock}\n}\n`);
  }

  /** 停止 cmux 应用（osascript quit，会关闭所有 cmux 终端会话） */
  async stop(): Promise<ToolResult> {
    this.logger.log('停止 cmux');
    try {
      await this.quitCmux();
      this.status = 'stopped';
      return { success: true, data: { stopped: true } };
    } catch (e) {
      return {
        success: false,
        error: {
          code: 'CMUX_EXECUTION_ERROR',
          message: `停止 cmux 失败: ${e instanceof Error ? e.message : String(e)}`,
        },
      };
    }
  }

  async execute(
    capability: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    try {
      // check_health 不走门禁（否则形成"查健康也需要健康"死循环）
      if (capability !== 'check_health') {
        const gate = this.client.quickGate();
        if (!gate.ok) {
          return {
            success: false,
            error: {
              code: gate.code ?? 'CMUX_EXECUTION_ERROR',
              message: gate.message ?? 'cmux gate blocked',
              details: gate.details,
            },
          };
        }
      }
      return await dispatchCapability(capability, params, context, this.client);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`cmux 执行失败 capability=${capability}: ${msg}`);
      return {
        success: false,
        error: { code: 'CMUX_EXECUTION_ERROR', message: msg },
      };
    }
  }

  async destroy(): Promise<void> {
    await this.client.close();
  }

  // ──────────────────────────────────────────────
  // 私有辅助
  // ──────────────────────────────────────────────

  /** 退出 cmux.app */
  private async quitCmux(): Promise<void> {
    try {
      await execAsync(`osascript -e 'tell application "${this.appPath}" to quit'`);
    } catch {
      // osascript 找不到 app 时退化为按进程名 quit
      try {
        await execAsync(`osascript -e 'tell application "cmux" to quit'`);
      } catch {
        // 忽略：可能本就没在跑
      }
    }
  }

  /** 轮询等待 cmux 就绪（installed + running + allowAll） */
  private async waitForReady(): Promise<boolean> {
    const deadline = Date.now() + START_READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(START_POLL_INTERVAL_MS);
      const h = await this.client.probeHealth(true);
      if (h.running && h.allowAll) return true;
    }
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
