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
  ToolDescriptor,
} from './tool-descriptor';
import { ToolContext, ToolErrorCodes, generateSessionId } from './tool-context';
import {
  validateFields,
  getDefaultRegistry,
  ContractFieldSchema,
  CapabilityContract,
} from '@human/contracts';

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
    const capabilityDef = tool.descriptor.capabilities.find(
      (c) => c.name === capability,
    );
    if (!capabilityDef) {
      const result: ToolResult = {
        success: false,
        error: {
          code: ToolErrorCodes.CAPABILITY_NOT_FOUND,
          message: `工具 ${toolId} 不支持能力 ${capability}`,
        },
      };
      return result;
    }

    // 契约基线解析：声明了 category 的工具，其能力出入参以注册表契约为强制基线
    // （插件 manifest 的 Schema 只能补充约束，不能替代或放松契约 —— 防止省略 Schema 绕过校验）
    let contractCap: CapabilityContract | undefined;
    if (tool.descriptor.category) {
      const contract = getDefaultRegistry().get(
        tool.descriptor.category,
        tool.descriptor.contractVersion ?? '',
      );
      if (!contract) {
        // fail-closed：能加载到这里的类别工具理论上已通过加载时校验，
        // 若运行时契约不可得（注册表被裁剪等），拒绝执行而非放行
        const result: ToolResult = {
          success: false,
          error: {
            code: ToolErrorCodes.CONTRACT_VIOLATION,
            message: `工具 ${toolId} 声明契约 ${tool.descriptor.category}@${tool.descriptor.contractVersion ?? '未声明版本'} 不可用，拒绝执行`,
          },
        };
        return result;
      }
      contractCap = contract.capabilities.find((c) => c.name === capability);
    }

    // 调用时入参校验：契约 Schema（强制基线）+ manifest Schema（补充约束）均须通过；
    // 宽松策略只校验声明过的字段，与无类别的存量工具兼容
    const paramErrors = this.checkSchemas(params, [
      { origin: '契约', schema: contractCap?.parameters as Record<string, ContractFieldSchema> | undefined },
      { origin: '声明', schema: capabilityDef.parametersSchema as Record<string, ContractFieldSchema> | undefined },
    ], 'parameters');
    if (paramErrors.length > 0) {
      const result: ToolResult = {
        success: false,
        error: {
          code: ToolErrorCodes.PARAMETER_VALIDATION_ERROR,
          message: `工具 ${toolId}.${capability} 参数校验失败: ${paramErrors.join('; ')}`,
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
      // 注入宿主对外 HTTP 基地址（插件用它构造 Body 可访问的资源 URL，如 TTS 音频）
      const effectiveContext = Object.assign({}, context, {
        publicBaseUrl: extendedContext.publicBaseUrl ?? this.publicBaseUrl,
      });

      // 执行工具能力（传递完整上下文，包含 toolCallId, signal, onUpdate）
      let result = await tool.execute(capability, params, effectiveContext);

      // 调用时出参校验：契约 Schema（强制基线）+ manifest Schema（补充约束）。
      // 插件输出不合契约即判失败，坏结果不向总线扩散（运行层兜底）
      if (result.success) {
        const returnErrors = this.checkSchemas(result.data, [
          { origin: '契约', schema: contractCap?.returns as Record<string, ContractFieldSchema> | undefined },
          { origin: '声明', schema: capabilityDef.returnsSchema as Record<string, ContractFieldSchema> | undefined },
        ], 'result');
        if (returnErrors.length > 0) {
          this.logger.error(
            `工具 ${toolId}.${capability} 输出不符合契约: ${returnErrors.join('; ')}`,
          );
          result = {
            success: false,
            error: {
              code: ToolErrorCodes.CONTRACT_VIOLATION,
              message: `工具 ${toolId}.${capability} 输出不符合契约: ${returnErrors.join('; ')}`,
            },
          };
        }
      }

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
   * 依次执行多份 Schema 校验，汇总错误（带来源标注）。
   * 空 Schema / 未声明跳过 —— 保证「契约未定义该字段且插件也未声明」时不误伤。
   */
  private checkSchemas(
    value: unknown,
    schemas: Array<{ origin: string; schema?: Record<string, ContractFieldSchema> }>,
    rootName: string,
  ): string[] {
    const errors: string[] = [];
    for (const { origin, schema } of schemas) {
      if (!schema || Object.keys(schema).length === 0) continue;
      const check = validateFields(value, schema, rootName);
      for (const err of check.errors) {
        errors.push(`[${origin}] ${err}`);
      }
    }
    return errors;
  }

  /**
   * 宿主对外 HTTP 基地址（TTS 音频等静态资源经 /tts-cache 暴露给 Body）
   */
  private get publicBaseUrl(): string {
    const port = process.env.PORT ?? '12002';
    return `http://127.0.0.1:${port}`;
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
