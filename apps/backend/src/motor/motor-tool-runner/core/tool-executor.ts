/**
 * Motor Tool Runner — 工具执行器
 *
 * 负责执行工具能力并发送执行事件
 */
import { Injectable, Logger } from '@nestjs/common';
import { ToolRegistry } from './tool-registry';
import { MotorGateway } from '../neural/motor-gateway';
import {
  MOTOR_TOPICS,
  ToolResult,
} from './tool-descriptor';
import { ToolContext, ToolErrorCodes, generateSessionId } from './tool-context';

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(
    private readonly registry: ToolRegistry,
    private readonly gateway: MotorGateway,
  ) {}

  /**
   * 执行工具能力
   */
  async execute(
    toolId: string,
    capability: string,
    params: Record<string, unknown>,
    context: ToolContext,
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

    // 发送 started 事件
    await this.gateway.emit(MOTOR_TOPICS.TOOL_STARTED, {
      sessionId: context.sessionId,
      tool: toolId,
      capability,
      toolName: tool.descriptor.name,
    });

    const startTime = Date.now();

    try {
      // 执行工具能力
      const result = await tool.execute(capability, params, context);

      // 发送 completed 事件
      await this.gateway.emit(MOTOR_TOPICS.TOOL_COMPLETED, {
        sessionId: context.sessionId,
        tool: toolId,
        capability,
        duration: Date.now() - startTime,
        success: result.success,
      });

      this.logger.log(
        `工具执行完成: ${toolId}.${capability}, 耗时: ${Date.now() - startTime}ms`,
      );

      return result;
    } catch (error) {
      // 发送 failed 事件
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.gateway.emit(MOTOR_TOPICS.TOOL_FAILED, {
        sessionId: context.sessionId,
        tool: toolId,
        capability,
        error: errorMessage,
        duration: Date.now() - startTime,
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
