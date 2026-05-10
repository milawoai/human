/**
 * Tool Config Types — 工具配置类型定义
 *
 * 定义 tools/ 目录下 JSON 配置文件的 TypeScript 类型
 */

/** 工具类型 */
export type ToolConfigType = 'builtin' | 'process' | 'shell';

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
  maxLength?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
}

/** 工具能力配置 */
export interface ToolCapabilityConfig {
  name: string;
  description?: string;
  parameters?: Record<string, ToolParameterSchema>;
  interface?: string;
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
  /** 是否启用 */
  enabled: boolean;
  /** 工具路径 */
  path?: string;
  /** 生命周期命令 */
  lifecycle?: ToolLifecycleCommands;
  /** 能力列表 */
  capabilities: ToolCapabilityConfig[];
  /** 接口列表 */
  interfaces?: ToolInterfaceConfig[];
  /** 健康检测配置 */
  healthCheck?: ToolHealthCheckConfig;
  /** 工具特定配置 */
  config?: Record<string, unknown>;
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
