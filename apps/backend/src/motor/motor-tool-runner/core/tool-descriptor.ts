/**
 * Motor Tool Runner — 工具描述符
 *
 * 定义工具的元数据、能力、状态等核心类型
 */
import { ActorRef } from '@/neural/interfaces';
import { ToolContext } from './tool-context';

// Re-export ToolContext for external use
export type { ToolContext } from './tool-context';

/** 工具类型 */
export type ToolType = 'builtin' | 'process' | 'shell';

/** 工具状态 */
export type ToolStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'running'
  | 'error'
  | 'stopped';

/** 工具接口类型 */
export type InterfaceType = 'http' | 'websocket' | 'grpc' | 'stdin' | 'file' | 'process';

/** 工具接口定义 — 工具暴露的访问点 */
export interface ToolInterface {
  /** 接口名称 */
  name: string;
  /** 接口类型 */
  type: InterfaceType;
  /** 访问地址 */
  endpoint?: string;
  /** 端口号 */
  port?: number;
  /** 路径 */
  path?: string;
  /** 认证方式 */
  auth?: 'none' | 'bearer' | 'basic' | 'apikey';
  /** 接口描述 */
  description?: string;
}

/** 工具能力定义 */
export interface ToolCapability {
  /** 能力名称，如 "tts.speak" */
  name: string;
  /** 能力描述 */
  description?: string;
  /** 参数 JSON Schema */
  parametersSchema?: Record<string, unknown>;
  /** 返回值 Schema */
  returnsSchema?: Record<string, unknown>;
  /** 该能力对应的接口（可选） */
  interface?: string;
}

/** 健康检测配置 */
export interface HealthCheckConfig {
  /** 检测方式 */
  type: 'http' | 'tcp' | 'process' | 'command';
  /** 检测地址或命令 */
  endpoint?: string;
  command?: string;
  /** 检测间隔（毫秒） */
  intervalMs?: number;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 连续失败次数阈值 */
  maxRetries?: number;
}

/** 工具生命周期命令 */
export interface ToolLifecycleCommands {
  /** 启动命令，支持模板变量 ${port} 等 */
  start?: string;
  /** 启动命令的工作目录 */
  startCwd?: string;
  /** 关闭命令 */
  stop?: string;
  /** 重启命令 */
  restart?: string;
  /** 环境变量 */
  env?: Record<string, string>;
}

/** 工具描述符 — 工具的元数据 */
export interface ToolDescriptor {
  /** 工具唯一 ID，如 "cosyvoice-tts" */
  id: string;
  /** 显示名称 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description?: string;
  /** 工具可执行文件/脚本路径 */
  filePath?: string;
  /** 生命周期命令 */
  lifecycle?: ToolLifecycleCommands;
  /** 支持的能力列表 */
  capabilities: ToolCapability[];
  /** 工具暴露的接口列表 */
  interfaces?: ToolInterface[];
  /** 工具类型 */
  type: ToolType;
  /** 工具特定配置 */
  config: Record<string, unknown>;
  /** 健康检测配置 */
  healthCheck?: HealthCheckConfig;
}

/** 工具元数据 — 用于工具注册表管理 */
export interface ToolMetadata {
  /** 工具 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 版本 */
  version: string;
  /** 描述 */
  description?: string;
  /** 类型 */
  type: ToolType;
  /** 工具可执行文件/脚本路径 */
  filePath?: string;
  /** 提供的功能列表（能力名称） */
  capabilities: string[];
  /** 暴露的接口列表 */
  interfaces: ToolInterface[];
  /** 启动命令 */
  startCommand?: string;
  /** 关闭命令 */
  stopCommand?: string;
  /** 检测方法 */
  healthCheckType?: HealthCheckConfig['type'];
  healthCheckEndpoint?: string;
  /** 状态 */
  status: ToolStatus;
  /** 注册时间 */
  registeredAt?: number;
}

/** 工具实例 — 运行时工具对象 */
export interface ToolInstance {
  readonly descriptor: ToolDescriptor;
  status: ToolStatus;

  /** 初始化（可选） */
  initialize?(): Promise<void>;

  /**
   * 执行能力
   * @param capability 能力名称
   * @param params 参数
   * @param context 执行上下文
   */
  execute(
    capability: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult>;

  /** 销毁（可选） */
  destroy?(): Promise<void>;
}

/** Builtin 工具提供者 — 负责为内置工具绑定执行逻辑 */
export interface BuiltinToolProvider {
  /** 对应的工具 ID */
  readonly providerId: string;
  /** 创建工具实例并绑定逻辑 */
  createInstance(descriptor: ToolDescriptor): ToolInstance;
}

/** 执行结果 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Motor 内部 Actor */
export const MOTOR_TOOL_RUNNER_ACTOR: ActorRef = {
  actorId: 'motor-tool-runner',
  runtime: 'nest',
  system: 'motor',
  module: 'tool-runner',
};

/** Motor Topics */
export const MOTOR_TOPICS = {
  // Commands
  TOOL_EXECUTE: 'motor.tool.execute',
  TOOL_LIST: 'motor.tool.list',
  TOOL_STATUS: 'motor.tool.status',
  TOOL_START: 'motor.tool.start',
  TOOL_STOP: 'motor.tool.stop',
  TOOL_RESTART: 'motor.tool.restart',
  TOOL_RELOAD: 'motor.tool.reload',

  // Events
  TOOL_STARTED: 'motor.tool.started',
  TOOL_PROGRESS: 'motor.tool.progress',
  TOOL_COMPLETED: 'motor.tool.completed',
  TOOL_FAILED: 'motor.tool.failed',
} as const;

/** Topic 类型 */
export type MotorTopic = (typeof MOTOR_TOPICS)[keyof typeof MOTOR_TOPICS];
