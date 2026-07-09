/**
 * @human/cmux-tools — 类型定义
 *
 * 本包独立声明与 motor-tool-runner 的契约接口（结构化类型兼容），
 * 不直接 import motor 源码，避免循环依赖，便于未来作为独立插件分发。
 */
import type { Readable } from 'stream';

// ──────────────────────────────────────────────
// 与 motor 对齐的契约（结构兼容，鸭子类型）
// ──────────────────────────────────────────────

/** 工具能力定义（结构对齐 motor ToolCapability） */
export interface ToolCapability {
  name: string;
  description?: string;
  parametersSchema?: Record<string, unknown>;
  returnsSchema?: Record<string, unknown>;
}

/** 工具描述符（结构对齐 motor ToolDescriptor，仅取本包需要的字段） */
export interface ToolDescriptor {
  id: string;
  name: string;
  version: string;
  description?: string;
  type: 'builtin' | 'process' | 'shell';
  capabilities: ToolCapability[];
  /** 工具特定配置（cmux.json 的 config 字段透传过来） */
  config: Record<string, unknown>;
  filePath?: string;
}

/** 工具状态（结构对齐 motor ToolStatus） */
export type ToolStatus = 'idle' | 'initializing' | 'ready' | 'running' | 'error' | 'stopped';

/** 执行结果（结构对齐 motor ToolResult） */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

/** 执行上下文（结构对齐 motor ToolContext，仅取需要的字段） */
export interface ToolContext {
  sessionId: string;
  correlationId?: string;
  causationId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/** 异步事件源（结构对齐 motor AsyncEventSource） */
export interface AsyncEventSource {
  start(emit: (eventName: string, payload: unknown) => void): Promise<void>;
  stop(): Promise<void>;
}

/** 工具实例（结构对齐 motor ToolInstance） */
export interface ToolInstance {
  readonly descriptor: ToolDescriptor;
  status: ToolStatus;
  initialize?(): Promise<void>;
  execute(capability: string, params: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
  /** 启动工具（拉起外部应用等），对齐 motor ToolInstance.start */
  start?(options?: { force?: boolean }): Promise<ToolResult>;
  /** 停止工具 */
  stop?(): Promise<ToolResult>;
  /** 异步事件源（转发外部事件到总线） */
  getEventSource?(): AsyncEventSource;
  destroy?(): Promise<void>;
}

/** Builtin 工具提供者（结构对齐 motor BuiltinToolProvider） */
export interface BuiltinToolProvider {
  readonly providerId: string;
  createInstance(descriptor: ToolDescriptor): ToolInstance;
}

// ──────────────────────────────────────────────
// cmux 专属类型
// ──────────────────────────────────────────────

/** 健康状态（三态自检） */
export interface CmuxHealthState {
  /** cmux 二进制是否安装且可执行 */
  installed: boolean;
  /** cmux app 是否运行（socket 可达 + ping 通） */
  running: boolean;
  /** 是否 allowAll 模式（外部进程可调用） */
  allowAll: boolean;
  /** 探测到的 socket 路径 */
  socketPath?: string;
  /** 当前访问模式原始值（cmuxOnly/allowAll/off） */
  accessMode?: string;
  /** cmux 二进制路径 */
  binaryPath: string;
  /** 上次探测时间戳 */
  lastChecked: number;
}

/** CmuxClient 配置 */
export interface CmuxClientConfig {
  /** cmux 二进制路径 */
  binaryPath: string;
  /** socket 路径覆盖（不填走自动探测） */
  socketPath?: string;
  /** 是否启用 socket 传输（失败自动降级 CLI） */
  socketEnabled: boolean;
  /** CLI 调用超时（ms） */
  cliTimeoutMs: number;
  /** socket 连接超时（ms） */
  socketConnectTimeoutMs: number;
  /** socket 单请求超时（ms） */
  socketRequestTimeoutMs: number;
  /** socket 空闲多久后关闭（ms，0=不关闭） */
  socketIdleTimeoutMs: number;
  /** 健康缓存有效期（ms） */
  healthTtlMs: number;
}

/** 传输策略提示 */
export type TransportHint = 'auto' | 'cli' | 'socket';

/** 统一调用结果 */
export interface CmuxCallResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; raw?: unknown };
}

/** CLI↔socket method 映射表
 *
 * 实测确认：socket method 名与 CLI 命令名多数不同形。
 * 同形的有：workspace.list/create/close/select、identify、ping、capabilities。
 */
export const METHOD_MAP: Record<string, string> = {
  send: 'surface.send_text',
  'send-key': 'surface.send_key',
  'read-screen': 'surface.read_text',
  notify: 'notification.create',
  'current-workspace': 'workspace.current',
};

/** 把 CLI 命令名转为 socket method 名（同形则原样返回） */
export function toSocketMethod(cliCommand: string): string {
  return METHOD_MAP[cliCommand] ?? cliCommand;
}

/** 倾向走 socket 的命令（大返回 / 高频，CLI spawn 开销不划算；或 CLI 输出非标准 JSON） */
export const SOCKET_PREFERRED = new Set(['read-screen', 'capture-pane', 'send', 'send-key', 'list-surfaces']);

/** 返回 JSON 的命令（决定 CLI 是否加 --json 并解析） */
export const JSON_COMMANDS = new Set([
  'workspace.list',
  'workspace.create',
  'workspace.close',
  'workspace.select',
  'identify',
  'capabilities',
  'current-workspace',
  'list-surfaces',
  'list-panes',
  'read-screen',
  'capture-pane',
]);

/** 错误码常量 */
export const CmuxErrorCodes = {
  NOT_INSTALLED: 'CMUX_NOT_INSTALLED',
  NOT_RUNNING: 'CMUX_NOT_RUNNING',
  NOT_ALLOWALL: 'CMUX_NOT_ALLOWALL',
  CLI_ERROR: 'CMUX_CLI_ERROR',
  SOCKET_ERROR: 'CMUX_SOCKET_ERROR',
  EXECUTION_ERROR: 'CMUX_EXECUTION_ERROR',
  CAPABILITY_NOT_FOUND: 'CAPABILITY_NOT_FOUND',
} as const;

/** socket 请求/响应报文 */
export interface CmuxSocketRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface CmuxSocketResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

/** 默认二进制路径 */
export const DEFAULT_BINARY_PATH = '/Applications/cmux.app/Contents/Resources/bin/cmux';

/** 默认配置 */
export const DEFAULT_CONFIG: CmuxClientConfig = {
  binaryPath: DEFAULT_BINARY_PATH,
  socketEnabled: true,
  cliTimeoutMs: 15000,
  socketConnectTimeoutMs: 3000,
  socketRequestTimeoutMs: 10000,
  socketIdleTimeoutMs: 60000,
  healthTtlMs: 10000,
};

// 仅用于消除未使用类型导入警告（保留 Readable 引用以便未来扩展 stream 接口）
export type _Readable = Readable;
