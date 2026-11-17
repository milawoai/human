/**
 * Workflow JSON 数据结构定义
 * 与 nodeTemplate 保持一致
 */

// ============= 节点定义 =============
import type { TaskQueueConfig } from '@shared/types/task'

export type NodeKind = 'SYSTEM' | 'DATA' | 'FS' | 'LLM' | 'INTEGRATION' | 'HUMAN' | 'CONTROL'
export type NodeStage = 'PLAN' | 'APPLY'
export type NodeEffect = 'PURE' | 'SIDE_EFFECT'

export interface NodeTemplate {
  department_id?: number
  owner_id?: number

  code: string
  version: number
  name: string
  desc?: string

  kind: NodeKind
  category?: string

  stage: NodeStage
  effect: NodeEffect

  runtime_handler: string // 建议 local:${code}@${version}

  input_schema: any
  output_schema: any
  config_schema: any
  default_config: any

  status: 1 | 2
  use_cases?: string[]
}

export interface ToolNodeUpsertPayload {
  department_id?: number
  node_code: string
  node_name: string
  node_desc: string
  node_kind: string
  category: string
  runtime_handler: string
  input_schema: any
  output_schema: any
  config_schema: any
  default_config: any
  status: number
  version: number
  owner_id?: number
  template_hash: string
  display_scope?: string
  use_cases?: any
}

export interface ToolNodeSyncApi {
  getTemplateHash(params: {
    node_code: string
    version: number
  }): Promise<{ exists: boolean; template_hash?: string }>

  upsertToolNode(payload: ToolNodeUpsertPayload): Promise<{ success: boolean; msg?: string }>
}

export interface RuntimeMeta {
  code: string
  version: number
  name: string
  stage: NodeStage
  effect: NodeEffect
  timeoutMs?: number
}

export interface ExecutionContext {
  runId: string
  nodeId?: string
  signal?: AbortSignal
  log: (level: 'info' | 'warn' | 'error', msg: string, extra?: any) => void
  emit?: (event: { type: string; payload?: any }) => void
}

export interface ExecuteWithTaskOptions {
  taskType: number
  params: any
  config?: Partial<TaskQueueConfig>

  /** 等待轮询间隔：建议 200~500ms */
  waitIntervalMs?: number

  /** 等待超时：建议 <= config.pollingTimeout */
  waitTimeoutMs?: number

  /** 进度回调 */
  onProgress?: (p: { status: string; progress?: number; pollingCount?: number }) => void

  /** ctx.signal abort 时是否 cancel task */
  cancelOnAbort?: boolean
}

/**
 * 工作流中的节点实例
 */
export interface WorkflowNode {
  /** 节点唯一ID（在工作流内唯一） */
  id: string

  /** 节点模板代码（对应 NodeTemplate.code） */
  nodeCode: string

  /** 节点模板版本 */
  version: number

  /** 节点在画布上的位置 */
  position: {
    x: number
    y: number
  }

  /** 节点显示标签（可自定义，默认使用模板名称） */
  label?: string

  /** 节点配置（对应 NodeTemplate.config_schema） */
  config: Record<string, any>

  /** 节点元数据（只读，从模板继承） */
  meta: {
    name: string
    desc?: string
    kind: NodeKind
    category?: string
    stage: NodeStage
    effect: NodeEffect
    runtimeHandler: string
    inputSchema: any
    outputSchema: any
  }

  /** 节点状态（用于 UI 展示） */
  ui?: {
    /** 是否折叠 */
    collapsed?: boolean
    /** 节点宽度 */
    width?: number
    /** 节点高度 */
    height?: number
    /** 自定义样式 */
    style?: Record<string, any>
  }
}

// ============= 连接/边定义 =============

/**
 * 节点之间的连接
 */
export interface WorkflowEdge {
  /** 边唯一ID */
  id: string

  /** 源节点ID */
  sourceNodeId: string

  /** 源节点输出端口（可选，用于多输出节点） */
  sourcePort?: string

  /** 目标节点ID */
  targetNodeId: string

  /** 目标节点输入端口（可选，用于多输入节点） */
  targetPort?: string

  /** 边的类型 */
  type?: 'default' | 'conditional' | 'loop' | 'error'

  /** 条件边的条件表达式（当 type='conditional' 时使用） */
  condition?: string

  /** 边的标签 */
  label?: string

  /** 边的 UI 配置 */
  ui?: {
    /** 路径点（用于自定义路径） */
    points?: Array<{ x: number; y: number }>
    /** 自定义样式 */
    style?: Record<string, any>
  }
}

// ============= 变量定义 =============

/**
 * 工作流变量
 */
export interface WorkflowVariable {
  /** 变量名 */
  name: string

  /** 变量类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'

  /** 默认值 */
  defaultValue?: any

  /** 变量描述 */
  description?: string

  /** 是否必需 */
  required?: boolean

  /** 变量作用域 */
  scope?: 'input' | 'output' | 'local'
}

// ============= 工作流定义 =============

/**
 * 工作流完整定义
 */
export interface Workflow {
  /** 工作流唯一ID */
  id: string

  /** 工作流名称 */
  name: string

  /** 工作流描述 */
  description?: string

  /** 工作流版本 */
  version: number

  /** 创建时间 */
  createdAt: string

  /** 更新时间 */
  updatedAt: string

  /** 创建者ID */
  creatorId?: number

  /** 所属部门ID */
  departmentId?: number

  /** 工作流标签 */
  tags?: string[]

  /** 工作流分类 */
  category?: string

  /** 工作流状态 */
  status: 'draft' | 'published' | 'archived'

  /** 节点列表 */
  nodes: WorkflowNode[]

  /** 边列表 */
  edges: WorkflowEdge[]

  /** 变量定义 */
  variables?: WorkflowVariable[]

  /** 工作流输入参数 schema */
  inputSchema?: any

  /** 工作流输出结果 schema */
  outputSchema?: any

  /** 工作流配置 */
  config?: {
    /** 超时时间（毫秒） */
    timeout?: number

    /** 最大重试次数 */
    maxRetries?: number

    /** 并发控制 */
    concurrency?: number

    /** 错误处理策略 */
    errorHandling?: 'stop' | 'continue' | 'rollback'

    /** 日志级别 */
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
  }

  /** 画布视图配置 */
  viewport?: {
    /** 缩放级别 */
    zoom: number

    /** 视口中心点 */
    center: {
      x: number
      y: number
    }
  }

  /** 扩展元数据 */
  metadata?: Record<string, any>
}

// ============= 工作流执行相关 =============

/**
 * 工作流执行实例
 */
export interface WorkflowExecution {
  /** 执行ID */
  id: string

  /** 工作流ID */
  workflowId: string

  /** 工作流版本 */
  workflowVersion: number

  /** 执行状态 */
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled'

  /** 开始时间 */
  startedAt: string

  /** 结束时间 */
  finishedAt?: string

  /** 输入参数 */
  input: any

  /** 输出结果 */
  output?: any

  /** 错误信息 */
  error?: string

  /** 节点执行记录 */
  nodeExecutions: Array<{
    nodeId: string
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
    startedAt?: string
    finishedAt?: string
    input?: any
    output?: any
    error?: string
    logs?: Array<{
      level: 'info' | 'warn' | 'error'
      message: string
      timestamp: string
      extra?: any
    }>
  }>

  /** 执行上下文 */
  context?: {
    /** 执行者ID */
    executorId?: number

    /** 触发方式 */
    triggerType?: 'manual' | 'schedule' | 'webhook' | 'api'

    /** 父执行ID（用于子工作流） */
    parentExecutionId?: string

    /** 自定义元数据 */
    metadata?: Record<string, any>
  }
}

// ============= 工作流模板 =============

/**
 * 工作流模板（用于快速创建工作流）
 */
export interface WorkflowTemplate {
  /** 模板ID */
  id: string

  /** 模板名称 */
  name: string

  /** 模板描述 */
  description?: string

  /** 模板分类 */
  category: string

  /** 模板标签 */
  tags?: string[]

  /** 模板缩略图 */
  thumbnail?: string

  /** 使用场景 */
  useCases?: string[]

  /** 模板内容（完整的 Workflow 结构） */
  workflow: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt' | 'creatorId' | 'status'>

  /** 模板状态 */
  status: 'active' | 'inactive'

  /** 使用次数 */
  usageCount?: number
}

// ============= 导出/导入格式 =============

/**
 * 工作流导出格式
 */
export interface WorkflowExportData {
  /** 格式版本 */
  formatVersion: string

  /** 导出时间 */
  exportedAt: string

  /** 工作流数据 */
  workflow: Workflow

  /** 依赖的节点模板列表（用于验证导入环境） */
  requiredNodeTemplates: Array<{
    code: string
    version: number
    name: string
  }>
}

// ============= 工具类型 =============

/**
 * 节点位置更新
 */
export interface NodePositionUpdate {
  nodeId: string
  position: {
    x: number
    y: number
  }
}

/**
 * 工作流验证结果
 */
export interface WorkflowValidationResult {
  valid: boolean
  errors: Array<{
    type: 'error' | 'warning'
    code: string
    message: string
    nodeId?: string
    edgeId?: string
  }>
}

/**
 * 工作流统计信息
 */
export interface WorkflowStats {
  nodeCount: number
  edgeCount: number
  variableCount: number
  complexity: number
  estimatedDuration?: number
}
