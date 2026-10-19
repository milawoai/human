/**
 * Motor Tool Runner — 命令/查询处理器
 *
 * 处理来自 Neural Core 的命令和查询
 */
import { Injectable, Logger } from '@nestjs/common';
import { ToolExecutor } from '../core/tool-executor';
import { ToolRegistry } from '../core/tool-registry';
import {
  MOTOR_TOPICS,
  ToolDescriptor,
  ToolResult,
  ToolMetadata,
} from '../core/tool-descriptor';
import { generateSessionId } from '../core/tool-context';

@Injectable()
export class ToolHandler {
  private readonly logger = new Logger(ToolHandler.name);

  constructor(
    private readonly executor: ToolExecutor,
    private readonly registry: ToolRegistry,
  ) {}

  /**
   * 处理 motor.tool.execute 命令
   */
  async handleExecute(payload: {
    tool?: string;
    capability: string;
    parameters?: Record<string, unknown>;
    sessionId?: string;
  }): Promise<ToolResult> {
    const { tool, capability, parameters = {} } = payload;
    const sessionId = payload.sessionId || generateSessionId();

    this.logger.log(`收到执行请求: ${tool || '*'}.${capability}, session: ${sessionId}`);

    // 如果指定了工具，直接执行
    if (tool) {
      return this.executor.execute(tool, capability, parameters, {
        sessionId,
      });
    }

    // 否则通过能力名称查找工具并执行
    return this.executor.executeByCapability(capability, parameters, {
      sessionId,
    });
  }

  /**
   * 处理 motor.tool.list 查询
   *
   * @param payload.detailed 返回完整元数据
   * @param payload.category 按类别契约过滤（如 'tts'）——上层「按类别发现能力」的入口
   */
  handleList(payload?: { detailed?: boolean; category?: string }): {
    tools: ToolDescriptor[] | ToolMetadata[];
  } {
    const category = payload?.category;

    if (payload?.detailed) {
      let metadata = this.registry.listMetadata();
      if (category) {
        metadata = metadata.filter((m) => m.category === category);
      }
      this.logger.debug(`查询工具列表(详细): ${metadata.length} 个${category ? ` (category=${category})` : ''}`);
      return { tools: metadata as any };
    }

    let tools = this.registry.listDescriptors();
    if (category) {
      tools = tools.filter((t) => t.category === category);
    }
    this.logger.debug(`查询工具列表: ${tools.length} 个${category ? ` (category=${category})` : ''}`);
    return { tools };
  }

  /**
   * 处理 motor.tool.status 查询
   */
  handleStatus(toolId?: string): {
    tools?: Array<{ id: string; name: string; status: string }>;
    tool?: { id: string; name: string; status: string };
    metadata?: ToolMetadata;
  } {
    if (toolId) {
      const tool = this.registry.get(toolId);
      if (tool) {
        const metadata = this.registry.getMetadata(toolId);
        return {
          tool: {
            id: tool.descriptor.id,
            name: tool.descriptor.name,
            status: tool.status,
          },
          metadata,
        };
      }
      return {};
    }

    return {
      tools: this.registry.getStatus(),
    };
  }

  /**
   * 处理 motor.tool.start 命令
   *
   * @param options.force 已运行时强制重启（用于切到 allowAll 等场景）
   */
  async handleStart(toolId: string, options?: { force?: boolean }): Promise<ToolResult> {
    this.logger.log(`启动工具: ${toolId}${options?.force ? ' (force)' : ''}`);
    const ok = await this.registry.startTool(toolId, options);
    return {
      success: ok,
      data: { toolId, started: ok },
    };
  }

  /**
   * 处理 motor.tool.stop 命令
   */
  async handleStop(toolId: string): Promise<ToolResult> {
    this.logger.log(`停止工具: ${toolId}`);
    const ok = await this.registry.stopTool(toolId);
    return {
      success: ok,
      data: { toolId, stopped: ok },
    };
  }

  /**
   * 处理 motor.tool.restart 命令
   */
  async handleRestart(toolId: string): Promise<ToolResult> {
    this.logger.log(`重启工具: ${toolId}`);
    const ok = await this.registry.restartTool(toolId);
    return {
      success: ok,
      data: { toolId, restarted: ok },
    };
  }
}