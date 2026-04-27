/**
 * Motor Tool Runner — 执行上下文
 *
 * 工具执行时的上下文信息
 */

/** 执行上下文 */
export interface ToolContext {
  /** 会话 ID */
  sessionId: string;
  /** 关联 ID（用于 request/response 链路追踪） */
  correlationId?: string;
  /** 因果 ID（标识触发当前消息的原始消息） */
  causationId?: string;
  /** 用户 ID */
  userId?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 执行进度 */
export interface ToolProgress {
  sessionId: string;
  tool: string;
  capability: string;
  progress: number; // 0.0 - 1.0
  message?: string;
}

/** 生成会话 ID */
export function generateSessionId(): string {
  return `mtool-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/** 生成工具执行结果的错误码 */
export const ToolErrorCodes = {
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  CAPABILITY_NOT_FOUND: 'CAPABILITY_NOT_FOUND',
  TOOL_NOT_READY: 'TOOL_NOT_READY',
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  PARAMETER_VALIDATION_ERROR: 'PARAMETER_VALIDATION_ERROR',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
} as const;
