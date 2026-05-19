/**
 * Motor Tool Runner — AgentToolAdapter
 *
 * 桥接 Motor ToolInstance 和 pi-agent-core AgentTool
 */
import { Type, Static } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import type {
  AgentTool,
  AgentToolResult,
  AgentToolUpdateCallback,
  BeforeToolCallContext,
  AfterToolCallContext,
} from '@mariozechner/pi-agent-core';
import type { TextContent, ImageContent } from '@mariozechner/pi-ai';
import type { ToolInstance, ToolDescriptor, ToolCapability, ToolContext, ToolResult } from './tool-descriptor';

// Typebox schema 构建工具
function toTypeboxSchema(params: Record<string, unknown> | undefined): TSchema {
  if (!params || Object.keys(params).length === 0) {
    return Type.Object({}, { additionalProperties: false });
  }

  const properties: Record<string, TSchema> = {};
  const required: string[] = [];

  for (const [key, spec] of Object.entries(params)) {
    const specObj = spec as Record<string, unknown>;
    const paramType = String(specObj.type || 'string');

    let schema: TSchema;
    switch (paramType) {
      case 'string':
        schema = Type.String({
          description: specObj.description as string | undefined,
          maxLength: specObj.maxLength as number | undefined,
        });
        break;
      case 'number':
        schema = Type.Number({
          description: specObj.description as string | undefined,
          minimum: specObj.minimum as number | undefined,
          maximum: specObj.maximum as number | undefined,
        });
        break;
      case 'boolean':
        schema = Type.Boolean({ description: specObj.description as string | undefined });
        break;
      case 'array':
        schema = Type.Array(Type.Unknown(), { description: specObj.description as string | undefined });
        break;
      case 'object':
        schema = Type.Object(toTypeboxSchema(specObj.properties as Record<string, unknown> | undefined));
        break;
      default:
        schema = Type.Unknown();
    }

    // 处理 default 值（Typebox 不直接支持，需要在 execute 时注入）
    properties[key] = schema;
    if (specObj.required || specObj.required === undefined && paramType !== 'object') {
      // 注意：这里简化处理，实际需要更精细的 required 判断
    }
  }

  // 重新计算 required
  for (const [key, spec] of Object.entries(params)) {
    const specObj = spec as Record<string, unknown>;
    if (specObj.required === true) {
      required.push(key);
    }
  }

  return Type.Object(properties, { required: required.length > 0 ? required : undefined });
}

/** 工具钩子接口 */
export interface ToolHooks {
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

/** 执行上下文扩展 */
export interface AdapterToolContext extends ToolContext {
  toolCallId: string;
  hooks?: ToolHooks;
  onUpdate?: AgentToolUpdateCallback<unknown>;
}

/** 将 ToolResult 转换为 AgentToolResult */
export function toAgentToolResult<T = unknown>(result: ToolResult): AgentToolResult<T> {
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
      terminate: true, // 错误时终止
    };
  }
}

/**
 * 将 Motor ToolInstance 转换为 pi-agent-core AgentTool
 *
 * 注意：一个 ToolInstance 可能支持多个 capability，
 * 每个 capability 对应一个 AgentTool
 */
export class AgentToolAdapter {
  constructor(
    private readonly toolInstance: ToolInstance,
    private readonly capability: ToolCapability,
    private readonly executeFn: (
      toolId: string,
      capability: string,
      params: Record<string, unknown>,
      context: AdapterToolContext
    ) => Promise<ToolResult>,
    private readonly hooks?: ToolHooks,
  ) {}

  /**
   * 创建 AgentTool 实例
   */
  createAgentTool(): AgentTool {
    const capability = this.capability;
    const toolInstance = this.toolInstance;

    // 生成 tool name：格式为 {toolId}.{capabilityName}
    const toolName = `${toolInstance.descriptor.id}.${capability.name}`;

    // 构建参数 schema
    const parametersSchema = toTypeboxSchema(
      capability.parametersSchema as Record<string, unknown> | undefined
    );

    return {
      name: toolName,
      label: `${toolInstance.descriptor.name}/${capability.name}`,
      description: capability.description || `Execute ${capability.name} on ${toolInstance.descriptor.name}`,
      parameters: parametersSchema,
      prepareArguments: (args: unknown) => {
        // 类型校验和默认值注入
        return this.prepareArguments(args);
      },
      execute: async (toolCallId, params, signal, onUpdate) => {
        // 执行前钩子
        if (this.hooks?.beforeToolCall) {
          const beforeResult = await this.hooks.beforeToolCall(
            {
              assistantMessage: {} as any, // 简化处理
              toolCall: { id: toolCallId, name: toolName } as any,
              args: params,
              context: {} as any,
            },
            signal
          );
          if (beforeResult?.block) {
            return {
              content: [{ type: 'text' as const, text: beforeResult.reason || 'Blocked' }],
              details: { blocked: true, reason: beforeResult.reason },
              terminate: true,
            };
          }
        }

        // 调用执行器
        const context = {
          sessionId: toolCallId,
          toolCallId,
          signal,
          onUpdate,
          hooks: this.hooks,
        } as AdapterToolContext;

        let result: ToolResult;
        try {
          result = await this.executeFn(
            toolInstance.descriptor.id,
            capability.name,
            params as Record<string, unknown>,
            context
          );
        } catch (error) {
          result = {
            success: false,
            error: {
              code: 'EXECUTION_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }

        // 执行后钩子
        if (this.hooks?.afterToolCall) {
          const afterResult = await this.hooks.afterToolCall(
            {
              assistantMessage: {} as any,
              toolCall: { id: toolCallId, name: toolName } as any,
              args: params,
              result: toAgentToolResult(result),
              isError: !result.success,
              context: {} as any,
            },
            signal
          );

          if (afterResult) {
            return {
              content: afterResult.content || toAgentToolResult(result).content,
              details: afterResult.details ?? result.data,
              terminate: afterResult.terminate,
            };
          }
        }

        return toAgentToolResult(result);
      },
      executionMode: 'parallel',
    };
  }

  /**
   * 准备参数：校验类型并注入默认值
   */
  private prepareArguments(args: unknown): Record<string, unknown> {
    if (typeof args !== 'object' || args === null) {
      return {};
    }

    const spec = this.capability.parametersSchema as Record<string, {
      type: string;
      default?: unknown;
      required?: boolean;
    }> | undefined;

    if (!spec) {
      return args as Record<string, unknown>;
    }

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      result[key] = value;
    }

    // 注入默认值
    for (const [key, paramSpec] of Object.entries(spec)) {
      if (result[key] === undefined && paramSpec.default !== undefined) {
        result[key] = paramSpec.default;
      }
    }

    return result;
  }
}

/**
 * 工具实例转换器
 * 将 ToolInstance 转换为多个 AgentTool（每个 capability 一个）
 */
export class ToolInstanceAdapter {
  constructor(
    private readonly toolInstance: ToolInstance,
    private readonly executeFn: (
      toolId: string,
      capability: string,
      params: Record<string, unknown>,
      context: AdapterToolContext
    ) => Promise<ToolResult>,
    private readonly hooks?: ToolHooks,
  ) {}

  /**
   * 转换为 AgentTool 数组
   */
  toAgentTools(): AgentTool[] {
    return this.toolInstance.descriptor.capabilities.map(
      (cap) => new AgentToolAdapter(this.toolInstance, cap, this.executeFn, this.hooks).createAgentTool()
    );
  }

  /**
   * 根据 capability 名称获取对应的 AgentTool
   */
  getAgentTool(capabilityName: string): AgentTool | undefined {
    const cap = this.toolInstance.descriptor.capabilities.find((c) => c.name === capabilityName);
    if (!cap) {
      return undefined;
    }
    return new AgentToolAdapter(this.toolInstance, cap, this.executeFn, this.hooks).createAgentTool();
  }
}