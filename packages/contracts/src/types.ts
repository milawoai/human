/**
 * 类别契约 — 类型定义
 *
 * 契约描述「某个类别的插件必须/可选提供哪些能力、能力出入参的 Schema、会产生哪些事件」。
 * 宿主（Motor）通过注册表按 category + contractVersion 加载契约并校验插件声明，
 * 自身不包含任何具体类别的分支逻辑；插件作者以 devDependency 引用本包获取类型与自测工具。
 */

/** 工具来源（与执行方式 builtin/process/shell 正交） */
export type ToolOrigin = 'core' | 'bundled' | 'installed';

/**
 * 字段 Schema —— 与 tools/*.json 中 parameters/returns 使用的简单格式一致。
 * 有意不采用完整 JSON Schema：声明成本低、可被轻量校验器执行。
 */
export interface ContractFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: unknown;
  description?: string;
  /** 允许的取值集合 */
  enum?: Array<string | number>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  /** array 元素类型（一层，简化） */
  items?: { type: ContractFieldSchema['type'] };
}

/** 能力契约 */
export interface CapabilityContract {
  /** 能力名，如 "tts.synthesize" */
  name: string;
  description?: string;
  /** 必选能力：声明该类别的工具必须实现 */
  required: boolean;
  /** 入参 Schema（字段名 → Schema） */
  parameters?: Record<string, ContractFieldSchema>;
  /** 返回值 Schema（字段名 → Schema） */
  returns?: Record<string, ContractFieldSchema>;
  /**
   * 执行方式提示：sync 直接返回结果；async 返回 job（taskId），
   * 由宿主统一维护 job 状态、调用方经事件或轮询观察（P5 生效，契约先行声明）。
   */
  mode?: 'sync' | 'async';
}

/** 事件契约 */
export interface EventContract {
  /** 事件名（topic 末段） */
  name: string;
  description?: string;
  /** payload 字段说明（字段名 → 说明） */
  payloadSchema?: Record<string, string>;
}

/** 类别契约 */
export interface ToolContract {
  /** 类别名，如 "tts"（manifest 中 category 字段） */
  category: string;
  /** 契约版本，如 "1.0"（manifest 中 contractVersion 字段） */
  version: string;
  description?: string;
  capabilities: CapabilityContract[];
  events?: EventContract[];
}

/**
 * 契约校验目标 —— 与 Motor 的 ToolDescriptor 结构兼容。
 * 结构化类型（duck typing），插件仓库不依赖宿主代码也可构造。
 */
export interface ContractCheckTarget {
  id: string;
  category?: string;
  contractVersion?: string;
  capabilities: Array<{ name: string }>;
}

/** 契约校验结果 */
export interface ContractValidationResult {
  ok: boolean;
  errors: string[];
  /** 命中的契约（ok 时有值） */
  contract?: ToolContract;
}

/** 字段 Schema 校验结果 */
export interface SchemaValidationResult {
  ok: boolean;
  errors: string[];
}
