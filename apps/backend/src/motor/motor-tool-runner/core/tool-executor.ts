/**
 * Motor Tool Runner — 工具执行器
 *
 * 负责执行工具能力并发送执行事件
 * 支持 pi-agent-core 的执行能力扩展
 */
import { Injectable, Logger } from '@nestjs/common';
import type { BeforeToolCallContext, AfterToolCallContext } from '@earendil-works/pi-agent-core';
import type { AgentToolResult, AgentToolUpdateCallback } from '@earendil-works/pi-agent-core';
import type { TextContent, ImageContent } from '@earendil-works/pi-ai';
import { ToolRegistry } from './tool-registry';
import { MotorGateway } from '../neural/motor-gateway';
import {
  MOTOR_TOPICS,
  ToolResult,
} from './tool-descriptor';
import { ToolContext, ToolErrorCodes, generateSessionId } from './tool-context';

/** 执行钩子 */
export interface ToolExecutorHooks {
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal
  ) => Promise<{ block?: boolean; reason?: string } | undefined>;
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal
  ) => Promise<{
    content?: (TextContent | ImageContent)[];
    details?: unknown;
    isError?: boolean;
    terminate?: boolean;
  } | undefined>;
}

/** 扩展的 ToolContext */
export interface ExtendedToolContext extends ToolContext {
  toolCallId?: string;
  signal?: AbortSignal;
  onUpdate?: AgentToolUpdateCallback<unknown>;
  hooks?: ToolExecutorHooks;
}

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(
    private readonly registry: ToolRegistry,
    private readonly gateway: MotorGateway,
  ) {}

  /**
   * 执行工具能力
   *
   * @param toolId 工具 ID
   * @param capability 能力名称
   * @param params 参数
   * @param context 执行上下文（支持 ExtendedToolContext）
   * @param hooks 执行钩子（可覆盖 context.hooks）
   */
  async execute(
    toolId: string,
    capability: string,
    params: Record<string, unknown>,
    context: ToolContext | ExtendedToolContext,
    hooks?: ToolExecutorHooks,
  ): Promise<ToolResult> {
    // 查找工具
    const tool = this.registry.get(toolId);
    if (!tool) {
      const result: ToolResult = {
        success: false,
        error: {
          code: ToolErrorCodes.TOOL_NOT_FOUND,
          message: `工具 ${toolId} 未找到`,
        },
      };
      return result;
    }

    // 检查工具是否就绪
    if (tool.status !== 'ready' && tool.status !== 'running') {
      const result: ToolResult = {
        success: false,
        error: {
          code: ToolErrorCodes.TOOL_NOT_READY,
          message: `工具 ${toolId} 未就绪，当前状态: ${tool.status}`,
        },
      };
      return result;
    }

    // 检查工具是否支持该能力
    const hasCapability = tool.descriptor.capabilities.some(
      (c) => c.name === capability,
    );
    if (!hasCapability) {
      const result: ToolResult = {
        success: false,
        error: {
          code: ToolErrorCodes.CAPABILITY_NOT_FOUND,
          message: `工具 ${toolId} 不支持能力 ${capability}`,
        },
      };
      return result;
    }

    // 获取扩展上下文
    const extendedContext = context as ExtendedToolContext;
    const sessionId = extendedContext.sessionId || generateSessionId();
    const toolCallId = extendedContext.toolCallId || sessionId;
    const signal = extendedContext.signal;
    const onUpdate = extendedContext.onUpdate;
    const effectiveHooks = hooks || extendedContext.hooks;

    // 执行前钩子
    if (effectiveHooks?.beforeToolCall) {
      const beforeResult = await effectiveHooks.beforeToolCall(
        {
          assistantMessage: {} as any,
          toolCall: { id: toolCallId, name: `${toolId}.${capability}` } as any,
          args: params,
          context: {
            messages: [],
          },
        },
        signal
      );
      if (beforeResult?.block) {
        return {
          success: false,
          error: {
            code: ToolErrorCodes.EXECUTION_BLOCKED,
            message: beforeResult.reason || 'Blocked by beforeToolCall hook',
          },
        };
      }
    }

    // 发送 started 事件
    await this.gateway.emit(MOTOR_TOPICS.TOOL_STARTED, {
      sessionId,
      tool: toolId,
      capability,
      toolName: tool.descriptor.name,
      toolCallId,
    });

    const startTime = Date.now();

    try {
      // 执行工具能力（传递完整上下文，包含 toolCallId, signal, onUpdate）
      const result = await tool.execute(capability, params, context);

      // 执行后钩子
      if (effectiveHooks?.afterToolCall) {
        await effectiveHooks.afterToolCall(
          {
            assistantMessage: {} as any,
            toolCall: { id: toolCallId, name: `${toolId}.${capability}` } as any,
            args: params,
            result: this.toAgentToolResult(result),
            isError: !result.success,
            context: {
              messages: [],
            },
          },
          signal
        );
      }

      // 发送 completed 事件
      await this.gateway.emit(MOTOR_TOPICS.TOOL_COMPLETED, {
        sessionId,
        tool: toolId,
        capability,
        duration: Date.now() - startTime,
        success: result.success,
        toolCallId,
      });

      this.logger.log(
        `工具执行完成: ${toolId}.${capability}, 耗时: ${Date.now() - startTime}ms`,
      );

      return result;
    } catch (error) {
      // 发送 failed 事件
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.gateway.emit(MOTOR_TOPICS.TOOL_FAILED, {
        sessionId,
        tool: toolId,
        capability,
        error: errorMessage,
        duration: Date.now() - startTime,
        toolCallId,
      });

      this.logger.error(`工具执行失败: ${toolId}.${capability}, ${errorMessage}`);

      return {
        success: false,
        error: {
          code: ToolErrorCodes.EXECUTION_ERROR,
          message: errorMessage,
        },
      };
    }
  }

  /**
   * 将 ToolResult 转换为 AgentToolResult 格式
   */
  private toAgentToolResult<T = unknown>(result: ToolResult): AgentToolResult<T> {
    if (result.success) {
      return {
        content: [
          {
            type: 'text' as const,
            text: typeof result.data === 'string'
              ? result.data
              : JSON.stringify(result.data),
          },
        ],
        details: result.data as any,
      };
    } else {
      return {
        content: [
          {
            type: 'text' as const,
            text: result.error?.message || 'Unknown error',
          },
        ],
        details: result.error as any,
        terminate: true,
      };
    }
  }

  /**
   * 执行工具能力（通过能力名称自动查找工具）
   */
  async executeByCapability(
    capability: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.registry.findByCapability(capability);
    if (!tool) {
      return {
        success: false,
        error: {
          code: ToolErrorCodes.TOOL_NOT_FOUND,
          message: `未找到支持能力 ${capability} 的工具`,
        },
      };
    }

    return this.execute(tool.descriptor.id, capability, params, context);
  }
}
