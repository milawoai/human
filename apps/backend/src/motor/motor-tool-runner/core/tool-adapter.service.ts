/**
 * Motor Tool Runner — 工具适配服务
 *
 * 将 Motor ToolInstance 转换为 pi-agent-core AgentTool
 */
import { Injectable, Logger } from '@nestjs/common';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ToolInstance, ToolDescriptor, ToolCapability } from './tool-descriptor';
import { ToolExecutor, ExtendedToolContext, ToolExecutorHooks } from './tool-executor';
import { ToolRegistry } from './tool-registry';
import {
  AgentToolAdapter,
  ToolHooks,
  AdapterToolContext,
} from './agent-tool-adapter';

/** 工具适配服务配置 */
export interface ToolAdapterServiceOptions {
  /** 是否自动注册到 Agent */
  autoRegister?: boolean;
  /** 默认执行钩子 */
  defaultHooks?: ToolHooks;
}

/**
 * 工具适配服务
 *
 * 将注册表中的 ToolInstance 转换为 AgentTool[]，
 * 供 pi-agent-core Agent 使用
 */
@Injectable()
export class ToolAdapterService {
  private readonly logger = new Logger(ToolAdapterService.name);

  constructor(
    private readonly executor: ToolExecutor,
    private readonly registry: ToolRegistry,
  ) {}

  /**
   * 将单个 ToolInstance 转换为 AgentTool
   *
   * @param tool 工具实例
   * @param capability 能力名称（如果指定，只转换该能力，否则转换所有）
   * @param hooks 执行钩子
   */
  toAgentTool(
    tool: ToolInstance,
    capability?: string,
    hooks?: ToolHooks,
  ): AgentTool | undefined {
    const targetCapability = capability
      ? tool.descriptor.capabilities.find((c) => c.name === capability)
      : tool.descriptor.capabilities[0];

    if (!targetCapability) {
      this.logger.warn(`工具 ${tool.descriptor.id} 没有能力 ${capability}`);
      return undefined;
    }

    return new AgentToolAdapter(
      tool,
      targetCapability,
      this.executeTool.bind(this),
      hooks,
    ).createAgentTool();
  }

  /**
   * 将单个 ToolInstance 转换为多个 AgentTool（每个 capability 一个）
   *
   * @param tool 工具实例
   * @param hooks 执行钩子
   */
  toAgentTools(tool: ToolInstance, hooks?: ToolHooks): AgentTool[] {
    return tool.descriptor.capabilities.map(
      (cap) => new AgentToolAdapter(tool, cap, this.executeTool.bind(this), hooks).createAgentTool()
    );
  }

  /**
   * 根据 capability 名称查找对应的 AgentTool
   *
   * @param capability 能力名称（格式：toolId.capabilityName 或只有 capabilityName）
   */
  findByCapability(capability: string): AgentTool | undefined {
    // 支持两种格式：
    // 1. "toolId.capabilityName" - 精确匹配
    // 2. "capabilityName" - 从注册表查找第一个匹配的

    let toolId: string | undefined;
    let capName: string;

    if (capability.includes('.')) {
      const parts = capability.split('.');
      toolId = parts[0];
      capName = parts.slice(1).join('.');
    } else {
      capName = capability;
    }

    if (toolId) {
      // 精确匹配
      const tool = this.registry.get(toolId);
      if (!tool) {
        return undefined;
      }
      return this.toAgentTool(tool, capName);
    } else {
      // 从注册表查找
      const tool = this.registry.findByCapability(capName);
      if (!tool) {
        return undefined;
      }
      return this.toAgentTool(tool, capName);
    }
  }

  /**
   * 获取所有工具的 AgentTool 数组
   *
   * @param hooks 执行钩子
   */
  getAllTools(hooks?: ToolHooks): AgentTool[] {
    const tools: AgentTool[] = [];
    for (const tool of this.registry.getAllInstances()) {
      tools.push(...this.toAgentTools(tool, hooks));
    }
    return tools;
  }

  /**
   * 根据工具 ID 获取所有 AgentTool
   *
   * @param toolId 工具 ID
   * @param hooks 执行钩子
   */
  getToolsByToolId(toolId: string, hooks?: ToolHooks): AgentTool[] {
    const tool = this.registry.get(toolId);
    if (!tool) {
      return [];
    }
    return this.toAgentTools(tool, hooks);
  }

  /**
   * 注册到 Agent（获取工具后可以直接传给 pi-agent-core Agent）
   *
   * @param hooks 执行钩子
   */
  getToolsForAgent(hooks?: ToolHooks): AgentTool[] {
    return this.getAllTools(hooks);
  }

  /**
   * 内部执行函数，供 AgentToolAdapter 调用
   */
  private async executeTool(
    toolId: string,
    capability: string,
    params: Record<string, unknown>,
    context: AdapterToolContext,
  ): Promise<import('./tool-descriptor').ToolResult> {
    return this.executor.execute(toolId, capability, params, context as ExtendedToolContext, context.hooks);
  }
}