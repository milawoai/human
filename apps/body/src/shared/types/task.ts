/**
 * 任务队列相关类型定义
 */

/**
 * 任务状态
 */
export type TaskStatus = 'pending' | 'polling' | 'success' | 'failed' | 'cancelled'

/**
 * 任务配置
 */
export interface TaskQueueConfig {
  /** 轮询间隔 (毫秒) */
  pollingInterval: number
  /** 轮询超时 (毫秒) */
  pollingTimeout: number
  /** 最大轮询次数 */
  maxPollingCount: number
  /** 是否自动清理完成的任务 */
  autoCleanup: boolean
  /** 清理延迟时间 (毫秒) */
  cleanupDelay: number
  /** 最大并发任务数 */
  maxConcurrentTasks: number
  /** 网络错误时是否重试 */
  retryOnError: boolean
  /** 最大重试次数 */
  maxRetryCount: number
}

/**
 * 任务项
 */
export interface TaskItem {
  /** 前端生成的唯一ID (UUID) */
  taskId: string
  /** 后端返回的任务token */
  token: string
  /** 任务类型 */
  taskType: string
  /** JSON字符串参数 */
  params: string
  /** 任务状态 */
  status: TaskStatus
  /** 进度信息 (0-100) */
  progress?: number
  /** 创建时间戳 */
  createTime: number
  /** 开始轮询时间 */
  startPollingTime?: number
  /** 结束时间 */
  endTime?: number
  /** 轮询间隔 (ms) */
  pollingInterval: number
  /** 轮询超时 (ms) */
  pollingTimeout: number
  /** 已轮询次数 */
  pollingCount: number
  /** 最大轮询次数 */
  maxPollingCount: number
  /** 重试次数 */
  retryCount: number
  /** 最大重试次数 */
  maxRetryCount: number
  /** 任务结果 */
  result?: any
  /** 错误信息 */
  error?: string
}

/**
 * 创建任务请求参数
 */
export interface CreateTaskRequest {
  /** 任务类型 */
  taskType: number
  /** JSON字符串参数 */
  params: string
  /** 可选的自定义配置 */
  config?: Partial<TaskQueueConfig>
}

/**
 * 创建任务响应
 */
export interface CreateTaskResponse {
  /** 是否成功 */
  success: boolean
  /** 任务ID */
  taskId?: string
  /** 错误信息 */
  error?: string
}

/**
 * 取消任务请求
 */
export interface CancelTaskRequest {
  /** 任务ID */
  taskId: string
}

/**
 * 取消任务响应
 */
export interface CancelTaskResponse {
  /** 是否成功 */
  success: boolean
  /** 消息 */
  message?: string
}

/**
 * 获取任务状态请求
 */
export interface GetTaskStatusRequest {
  /** 任务ID */
  taskId: string
}

/**
 * 获取任务状态响应
 */
export interface GetTaskStatusResponse {
  /** 是否成功 */
  success: boolean
  /** 任务状态 */
  status?: TaskStatus
  /** 进度 */
  progress?: number
  /** 轮询次数 */
  pollingCount?: number
  /** 错误信息 */
  error?: string
  /** 任务结果 */
  result?: any
}

/**
 * 获取所有任务请求
 */
export interface GetAllTasksRequest {
  /** 过滤条件 */
  filter?: {
    status?: TaskStatus
    taskType?: string
  }
}

/**
 * 清理任务请求
 */
export interface CleanupTaskRequest {
  /** 任务ID (可选,不传则清理所有已完成任务) */
  taskId?: string
}

/**
 * 后端创建任务API响应
 */
export interface BackendCreateTaskResponse {
  /** 是否成功 */
  success: boolean
  /** 任务token */
  token?: string
  /** 错误信息 */
  msg?: string
  /** 数据 */
  data?: {
    token: string
    taskId?: string
  }
}

/**
 * 后端任务状态枚举: 0待执行，1执行中，2成功，3失败
 */
export enum BackendTaskStatus {
  Pending = 0,
  Running = 1,
  Success = 2,
  Failed = 3
}

/**
 * 后端查询任务状态API响应
 */
export interface BackendTaskStatusResponse {
  /** 任务token */
  taskToken: string
  /** 任务状态: 0待执行，1执行中，2成功，3失败 */
  taskStatus: number
  /** 任务结果内容 */
  taskResultContent: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
  /** 进度 (0-100) */
  progress?: number
  /** 错误信息 */
  error?: string
}

/**
 * 后端查询任务详情API响应
 */
export interface BackendTaskDetailResponse {
  /** 任务token */
  taskToken: string
  /** 任务状态: 0待执行，1执行中，2成功，3失败 */
  taskStatus: number
  /** 任务参数 */
  taskParamContent: string
}

/**
 * 任务结果事件数据
 */
export interface TaskResultEvent {
  /** 任务ID */
  taskId: string
  /** 是否成功 */
  success: boolean
  /** 任务结果 */
  result?: any
  /** 错误信息 */
  error?: string
}
