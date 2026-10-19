/**
 * Motor Tool Runner — 主服务
 *
 * 负责模块初始化、工具注册、消息处理
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ToolRegistry } from './core/tool-registry';
import { ToolExecutor } from './core/tool-executor';
import { MotorGateway } from './neural/motor-gateway';
import { ToolHandler } from './neural/tool-handler';
import {
  MOTOR_TOOL_RUNNER_ACTOR,
  MOTOR_TOPICS,
  ToolInstance,
  ToolResult,
  BuiltinToolProvider,
  AsyncEventSource,
} from './core/tool-descriptor';
import type { BusMessage } from '@/neural/interfaces';
import type { InternalCommandHandler } from '@/neural/neural-http/neural-http.service';
import { NeuralHttpService } from '@/neural/neural-http/neural-http.service';
import { ToolConfigService } from '@/brain/tool-config/tool-config.service';
import { PiCodingProvider } from './providers/pi-coding-provider';
import { SystemSessionProvider } from './providers/system-session-provider';

@Injectable()
export class MotorToolRunnerService implements OnModuleInit, OnModuleDestroy, InternalCommandHandler {
  private readonly logger = new Logger(MotorToolRunnerService.name);

  private toolConfigService: ToolConfigService | null = null;

  /** 已注册的内置工具提供者 */
  private readonly builtinProviders: BuiltinToolProvider[] = [];

  /** toolId → 异步事件源（工具注册时启动，注销时停止） */
  private readonly eventSources = new Map<string, AsyncEventSource>();

  constructor(
    private readonly registry: ToolRegistry,
    private readonly executor: ToolExecutor,
    private readonly gateway: MotorGateway,
    private readonly handler: ToolHandler,
    private readonly httpService: NeuralHttpService,
    private readonly piCodingProvider: PiCodingProvider,
    private readonly systemSessionProvider: SystemSessionProvider,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Motor Tool Runner 初始化...');

    // 注册内置工具提供者
    this.registerBuiltinProvider(this.piCodingProvider);
    this.registerBuiltinProvider(this.systemSessionProvider);

    // 尝试获取 ToolConfigService（来自 BrainModule）
    if (this.moduleRef) {
      try {
        this.toolConfigService = this.moduleRef.get(ToolConfigService, { strict: false });
        this.logger.log('ToolConfigService 已注入');
      } catch {
        this.logger.debug('ToolConfigService 未找到，跳过配置文件加载');
      }
    }

    // 注册 Motor Actor
    this.gateway.register();

    // 注册自身为内部命令处理器
    this.httpService.registerCommandHandler(this);

    // 从配置文件加载工具
    await this.loadToolsFromConfig();

    this.logger.log('Motor Tool Runner 初始化完成');
  }

  /**
   * 注册内置工具提供者
   */
  registerBuiltinProvider(provider: BuiltinToolProvider): void {
    this.builtinProviders.push(provider);
    this.logger.log(`内置工具提供者已注册: ${provider.providerId}`);
  }

  /**
   * 从配置文件加载工具
   */
  private async loadToolsFromConfig(): Promise<void> {
    if (!this.toolConfigService) {
      this.logger.debug('ToolConfigService 不可用，跳过配置加载');
      return;
    }

    try {
      const tools = await this.toolConfigService.reload(this.builtinProviders);
      for (const tool of tools) {
        // 复用 registerTool：统一走 registry.register + capability 注册 + startEventSource
        await this.registerTool(tool);
        this.logger.log(`从配置加载工具: ${tool.descriptor.id} (${tool.descriptor.type})`);
      }
      this.logger.log(`配置加载完成，共 ${tools.length} 个工具`);
    } catch (error) {
      this.logger.error(`加载工具配置失败: ${error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Motor Tool Runner 关闭...');

    // 清理所有已注册的工具
    const tools = this.registry.listDescriptors();
    for (const tool of tools) {
      await this.unregisterTool(tool.id);
    }

    // 兜底：停止所有事件源（unregisterTool 应已停，这里防漏）
    for (const toolId of Array.from(this.eventSources.keys())) {
      await this.stopEventSource(toolId);
    }

    this.logger.log('Motor Tool Runner 已关闭');
  }

  /**
   * 注册工具
   */
  async registerTool(tool: ToolInstance): Promise<void> {
    await this.registry.register(tool);
    this.gateway.registerToolCapabilities(tool);
    // 若工具提供异步事件源，启动它并转发到总线
    await this.startEventSource(tool);
    this.logger.log(`工具已注册: ${tool.descriptor.id}`);
  }

  /**
   * 注销工具
   */
  async unregisterTool(toolId: string): Promise<void> {
    await this.stopEventSource(toolId);
    await this.registry.unregister(toolId);
    this.logger.log(`工具已注销: ${toolId}`);
  }

  /**
   * 启动工具的异步事件源（若有）。
   *
   * 工具产生的每个事件转发到 Neural Core 总线：
   * topic = motor.tool.<toolId>.event.<eventName>
   * 订阅方（brain/展示方）订阅该 topic 即可收到。
   */
  private async startEventSource(tool: ToolInstance): Promise<void> {
    if (typeof tool.getEventSource !== 'function') return;
    const toolId = tool.descriptor.id;
    try {
      const source = tool.getEventSource();
      await source.start(async (eventName, payload) => {
        const topic = `motor.tool.${toolId}.event.${eventName}`;
        await this.gateway.emit(topic, payload);
      });
      this.eventSources.set(toolId, source);
      this.logger.log(`异步事件源已启动: ${toolId} → motor.tool.${toolId}.event.*`);
    } catch (error) {
      this.logger.error(`启动事件源失败 ${toolId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 停止工具的异步事件源 */
  private async stopEventSource(toolId: string): Promise<void> {
    const source = this.eventSources.get(toolId);
    if (!source) return;
    try {
      await source.stop();
    } catch {
      /* ignore */
    }
    this.eventSources.delete(toolId);
  }

  /**
   * 获取工具注册表（供其他模块使用）
   */
  getRegistry(): ToolRegistry {
    return this.registry;
  }

  /**
   * 获取执行器（供其他模块使用）
   */
  getExecutor(): ToolExecutor {
    return this.executor;
  }

  // ──────────────────────────────────────────────
  // InternalCommandHandler 实现
  // ──────────────────────────────────────────────

  /**
   * 判断是否能处理该 topic
   */
  canHandle(topic: string): boolean {
    return topic.startsWith('motor.tool');
  }

  /**
   * 处理内部命令
   */
  async handleCommand(message: BusMessage): Promise<{ success: boolean; data?: unknown; msg?: string }> {
    this.logger.log(`[handleCommand] 收到命令: topic=${message.topic}`);

    switch (message.topic) {
      case MOTOR_TOPICS.TOOL_EXECUTE: {
        const payload = message.payload as { tool?: string; capability: string; parameters?: Record<string, unknown>; sessionId?: string };
        const result = await this.handler.handleExecute({
          tool: payload.tool,
          capability: payload.capability,
          parameters: payload.parameters,
          sessionId: payload.sessionId,
        });
        return { success: result.success, data: result };
      }

      case MOTOR_TOPICS.TOOL_LIST: {
        const payload = message.payload as { detailed?: boolean; category?: string } | undefined;
        const result = this.handler.handleList(payload);
        return { success: true, data: result };
      }

      case MOTOR_TOPICS.TOOL_STATUS: {
        const payload = message.payload as { toolId?: string };
        const result = this.handler.handleStatus(payload.toolId);
        return { success: true, data: result };
      }

      case MOTOR_TOPICS.TOOL_START: {
        const payload = message.payload as { toolId: string; force?: boolean };
        const result = await this.handler.handleStart(payload.toolId, { force: payload.force });
        return { success: result.success, data: result };
      }

      case MOTOR_TOPICS.TOOL_STOP: {
        const payload = message.payload as { toolId: string };
        const result = await this.handler.handleStop(payload.toolId);
        return { success: result.success, data: result };
      }

      case MOTOR_TOPICS.TOOL_RESTART: {
        const payload = message.payload as { toolId: string };
        const result = await this.handler.handleRestart(payload.toolId);
        return { success: result.success, data: result };
      }

      case MOTOR_TOPICS.TOOL_RELOAD: {
        // 重新加载所有已注册的工具
        const tools = this.registry.listDescriptors();
        for (const tool of tools) {
          await this.registry.unregister(tool.id);
        }
        await this.loadToolsFromConfig();
        return { success: true, data: { message: '工具配置已重新加载' } };
      }

      case MOTOR_TOPICS.TOOL_INSTALL: {
        // 安装/同步工具包配置：从独立包的 config/<id>.json 同步到用户磁盘，然后 reload
        const payload = message.payload as { toolId: string };
        if (!payload?.toolId) {
          return { success: false, msg: '缺少 toolId 参数' };
        }
        if (!this.toolConfigService) {
          return { success: false, msg: 'ToolConfigService 不可用，无法安装' };
        }
        const result = await this.toolConfigService.installToolConfig(payload.toolId);
        if (!result.success) {
          return { success: false, data: result };
        }
        // 同步成功后 reload，让新配置生效
        const installedTools = this.registry.listDescriptors();
        for (const tool of installedTools) {
          await this.registry.unregister(tool.id);
        }
        await this.loadToolsFromConfig();
        return { success: true, data: result };
      }

      default:
        return { success: false, msg: `Motor 无法处理 topic: ${message.topic}` };
    }
  }
}