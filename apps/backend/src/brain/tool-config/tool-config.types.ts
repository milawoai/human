/**
 * Tool Config Types — 工具配置类型定义
 *
 * 定义 tools/ 目录下 JSON 配置文件的 TypeScript 类型
 */

/** 工具类型（执行方式） */
export type ToolConfigType = 'builtin' | 'process' | 'shell';

/** 工具来源（与执行方式正交）：core 宿主内置 | bundled 随工程分发 | installed 工程外安装 */
export type ToolConfigOrigin = 'core' | 'bundled' | 'installed';

/** 工具接口类型 */
export type ToolInterfaceType = 'http' | 'websocket' | 'grpc' | 'stdin' | 'file' | 'process';

/** 健康检测配置 */
export interface ToolHealthCheckConfig {
  type: 'http' | 'tcp' | 'process' | 'command';
  endpoint?: string;
  command?: string;
  intervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

/** 工具生命周期命令 */
export interface ToolLifecycleCommands {
  start?: string;
  startCwd?: string;
  stop?: string;
  restart?: string;
  env?: Record<string, string>;
}

/** 参数模式 */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: Array<string | number>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

/** 工具能力配置 */
export interface ToolCapabilityConfig {
  name: string;
  description?: string;
  parameters?: Record<string, ToolParameterSchema>;
  /** 返回值 Schema（字段名 → Schema）；宿主在调用时据此校验输出 */
  returns?: Record<string, ToolParameterSchema>;
  interface?: string;
}

/** 工具事件配置 —— 声明工具通过总线推送的异步事件 */
export interface ToolEventConfig {
  /** 事件名（topic 末段）。完整 topic 由 motor 拼为 motor.tool.<toolId>.event.<name> */
  name: string;
  /** 事件描述：什么时候发生、用途 */
  description?: string;
  /** payload 字段说明（字段名 → 说明） */
  payloadSchema?: Record<string, string>;
}

/** 工具接口配置 */
export interface ToolInterfaceConfig {
  name: string;
  type: ToolInterfaceType;
  endpoint?: string;
  port?: number;
  path?: string;
  auth?: 'none' | 'bearer' | 'basic' | 'apikey';
  description?: string;
}

/**
 * 工具详情配置 — tools/*.json 的结构
 */
export interface ToolConfig {
  id: string;
  name: string;
  version: string;
  description?: string;
  type: ToolConfigType;
  /**
   * 是否启用（可选）。
   *
   * 单一真相源是 index.json 的 ToolIndexItem.enabled，详情文件的此字段不再被读取。
   * 保留此字段仅为向后兼容旧配置文件；新写入的详情文件不再带 enabled。
   */
  enabled?: boolean;
  /** 工具路径 */
  path?: string;
  /** 生命周期命令 */
  lifecycle?: ToolLifecycleCommands;
  /** 能力列表 */
  capabilities: ToolCapabilityConfig[];
  /** 异步事件列表（工具通过总线 motor.tool.<id>.event.* 推送的事件声明） */
  events?: ToolEventConfig[];
  /** 接口列表 */
  interfaces?: ToolInterfaceConfig[];
  /** 健康检测配置 */
  healthCheck?: ToolHealthCheckConfig;
  /** 工具特定配置 */
  config?: Record<string, unknown>;
  /**
   * builtin 工具的 provider 所在包名（新机制）。
   * 设置后 motor 通过 dynamicImport(providerModule) 加载 provider，
   * 不再依赖 motor 模块内 import 具体 provider。
   */
  providerModule?: string;
  /** provider 在包中导出的名称（配合 providerModule 使用，默认 'default'） */
  providerExport?: string;
  /**
   * 类别契约（如 'tts'）。声明后加载时经 @human/contracts 注册表校验：
   * 必选能力齐全、版本已注册；调用时出入参按能力 Schema 校验。
   */
  category?: string;
  /** 类别契约版本（如 '1.0'），声明 category 时必填 */
  contractVersion?: string;
  /** 工具来源：core / bundled / installed（与 type 执行方式正交） */
  origin?: ToolConfigOrigin;
}

/**
 * 工具索引项 — index.json 中单个工具的引用
 */
export interface ToolIndexItem {
  id: string;
  name: string;
  enabled: boolean;
  configFile: string;
}

/**
 * 工具索引 — index.json 的结构
 */
export interface ToolIndex {
  version: string;
  lastUpdated: number;
  tools: ToolIndexItem[];
}

/** 默认配置目录 */
export const DEFAULT_TOOLS_DIR = '.ai_secretary/tools';
