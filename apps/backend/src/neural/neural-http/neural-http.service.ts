/**
 * NeuralHttpService — HTTP 业务逻辑层
 *
 * 封装消息触发、查询、管理、调试等业务逻辑，
 * Controller 仅做路由转发。
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import axios from 'axios';
import type { BusMessage, MessageKind } from '../interfaces';
import { NeuralCoreService } from '../neural-core/neural-core.service';
import { NeuralWsGateway } from '../neural-ws/neural-ws.gateway';

const PYTHON_SERVICE_URL = 'http://localhost:12003';

/**
 * 内部命令处理器接口。
 * Brain 等内部 Actor 实现此接口，处理 runtime === 'nest' 的 command。
 */
export interface InternalCommandHandler {
  /**
   * 判断是否能处理该 topic。
   */
  canHandle(topic: string): boolean;

  /**
   * 处理内部命令，返回结果。
   */
  handleCommand(message: BusMessage): Promise<{ success: boolean; data?: any; msg?: string }>;
}

@Injectable()
export class NeuralHttpService implements OnModuleInit {
  private readonly logger = new Logger(NeuralHttpService.name);
  private commandHandlers: InternalCommandHandler[] = [];

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly wsGateway: NeuralWsGateway,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    // 延迟发现所有 InternalCommandHandler 实现
    // 通过 ModuleRef 查找 BrainModule 等注册的 handlers
    this.discoverHandlers();
  }

  /**
   * 注册内部命令处理器。由 Brain 等模块在初始化时调用。
   */
  registerCommandHandler(handler: InternalCommandHandler): void {
    this.commandHandlers.push(handler);
    this.logger.log(`内部命令处理器已注册: ${handler.constructor.name}`);
  }

  /**
   * 延迟发现 BrainModule 注册的 handlers。
   */
  private discoverHandlers(): void {
    try {
      // 尝试从容器中获取 BrainInitService
      const brainInit = this.moduleRef.get('BrainInitService', { strict: false });
      if (brainInit && typeof brainInit.canHandle === 'function') {
        this.registerCommandHandler(brainInit as InternalCommandHandler);
      }
    } catch {
      // BrainModule 可能未注册，忽略
      this.logger.debug('BrainModule 未注册，跳过内部处理器发现');
    }
  }

  // ──────────────────────────────────────────────
  // 触发类
  // ──────────────────────────────────────────────

  /**
   * 触发消息 — 构造 BusMessage、路由、发送。
   *
   * 路由策略（按 kind）：
   *   query:
   *     - runtime === 'python' → HTTP 中转
   *     - runtime === 'nest'   → 进程内调用 InternalCommandHandler
   *   command:
   *     - runtime === 'nest'   → 进程内调用 InternalCommandHandler
   *   其他: 走 WS 发送
   */
  async trigger(params: {
    kind: MessageKind;
    topic: string;
    payload?: any;
    source?: { actorId: string; runtime: string; system: string; module?: string };
    target?: { actorId: string; runtime: string; system: string; module?: string };
  }) {
    const message: BusMessage = {
      id: crypto.randomUUID(),
      kind: params.kind,
      topic: params.topic,
      source: (params.source as any) ?? {
        actorId: 'neural-http',
        runtime: 'nest',
        system: 'neural',
      },
      target: (params.target as any) ?? undefined,
      timestamp: Date.now(),
      payload: params.payload ?? {},
    };

    this.logger.log(`[trigger] 收到触发请求: kind=${message.kind}, topic=${message.topic}, payload=${JSON.stringify(message.payload)}`);

    // 查 Capability 找 target actor
    const capabilities = this.coreService.findCapabilities(
      message.topic,
      message.kind,
    );

    this.logger.log(`[trigger] 查到 ${capabilities.length} 个 Capability${capabilities.length > 0 ? `: actor=${capabilities[0].actor.actorId}, runtime=${capabilities[0].actor.runtime}` : ''}`);

    if (capabilities.length > 0) {
      const actor = capabilities[0].actor;

      // ── query + python → HTTP 中转 ──
      if (params.kind === 'query' && actor.runtime === 'python') {
        this.logger.log(`[trigger] 路由决策 → queryViaHttp (python)`);
        return await this.queryViaHttp(message);
      }

      // ── command/query + nest → 进程内调用 ──
      if (
        (params.kind === 'command' || params.kind === 'query') &&
        actor.runtime === 'nest'
      ) {
        this.logger.log(`[trigger] 路由决策 → dispatchInternal (nest), 已注册 ${this.commandHandlers.length} 个 handler`);
        return await this.dispatchInternal(message);
      }
    }

    // ── 其他: 走 WS 发送逻辑 ──
    this.logger.log(`[trigger] 路由决策 → WS 发送 (默认)`);
    const result = this.coreService.route(message);
    const sentCount = this.dispatchMessage(message, result);

    return {
      success: true,
      messageId: message.id,
      sentTo: sentCount,
    };
  }

  // ──────────────────────────────────────────────
  // 查询类
  // ──────────────────────────────────────────────

  listActors() {
    return {
      success: true,
      data: this.coreService.getAllActors(),
    };
  }

  listCapabilities(params?: { topic?: string; kind?: MessageKind }) {
    if (params?.topic) {
      return {
        success: true,
        data: this.coreService.findCapabilities(params.topic, params.kind),
      };
    }
    return {
      success: true,
      data: this.coreService.getAllCapabilities(),
    };
  }

  listSubscriptions() {
    return {
      success: true,
      data: this.coreService.getAllSubscriptions(),
    };
  }

  // ──────────────────────────────────────────────
  // 管理类
  // ──────────────────────────────────────────────

  cleanupStaleActors(timeoutMs?: number) {
    const timeout = timeoutMs ?? 60_000;
    const cleaned = this.coreService.cleanupStaleActors(timeout);
    return {
      success: true,
      cleaned,
      count: cleaned.length,
    };
  }

  disconnectActor(actorId: string) {
    const ok = this.wsGateway.disconnectActor(actorId);
    return {
      success: ok,
      actorId,
    };
  }

  // ──────────────────────────────────────────────
  // 调试类
  // ──────────────────────────────────────────────

  debugPublish(params: { kind: MessageKind; topic: string; payload?: any }) {
    const message: BusMessage = {
      id: crypto.randomUUID(),
      kind: params.kind,
      topic: params.topic,
      source: {
        actorId: 'neural-debug',
        runtime: 'nest',
        system: 'neural',
      },
      timestamp: Date.now(),
      payload: params.payload ?? {},
    };

    this.logger.debug(`调试发布: ${JSON.stringify(params)}`);

    const result = this.coreService.route(message);
    const sentCount = this.dispatchMessage(message, result);

    return {
      success: true,
      messageId: message.id,
      routeResult: {
        targets: result.targets.map((t) => t.actor.actorId),
        subscribers: result.subscribers.map((s) => s.actor.actorId),
      },
      sentTo: sentCount,
    };
  }

  debugStatus() {
    return {
      success: true,
      actors: this.coreService.getAllActors().length,
      capabilities: this.coreService.getAllCapabilities().length,
      subscriptions: this.coreService.getAllSubscriptions().length,
      wsConnections: this.wsGateway.getConnectedCount(),
    };
  }

  // ──────────────────────────────────────────────
  // 内部方法
  // ──────────────────────────────────────────────

  /**
   * 通过 HTTP 中转 query 到 Python 服务。
   */
  private async queryViaHttp(message: BusMessage): Promise<any> {
    try {
      const res = await axios.post(`${PYTHON_SERVICE_URL}/neural/query`, {
        topic: message.topic,
        payload: message.payload,
      });
      return { success: true, data: res.data };
    } catch (error) {
      this.logger.error(`queryViaHttp 失败: ${error.message}`);
      return { success: false, msg: error.message };
    }
  }

  /**
   * 进程内调用 — 交给注册的 InternalCommandHandler 处理。
   * 适用于 runtime === 'nest' 的内部 Actor（如 Brain）。
   */
  private async dispatchInternal(message: BusMessage): Promise<any> {
    const handler = this.commandHandlers.find((h) => h.canHandle(message.topic));
    if (!handler) {
      this.logger.warn(`[dispatchInternal] 无可用内部命令处理器: topic=${message.topic}, 已注册 handlers: ${this.commandHandlers.map(h => h.constructor.name).join(', ') || '无'}`);
      return { success: false, msg: `无可用内部命令处理器: ${message.topic}` };
    }

    this.logger.log(`[dispatchInternal] 匹配到 handler: ${handler.constructor.name}, 开始执行...`);
    try {
      const result = await handler.handleCommand(message);
      this.logger.log(`[dispatchInternal] handler 执行完成: success=${result.success}`);
      return result;
    } catch (error) {
      this.logger.error(`[dispatchInternal] handler 执行异常: ${error.message}`);
      return { success: false, msg: error.message };
    }
  }

  /**
   * 将消息发送到路由结果中的所有目标（定向 + 广播）。
   * 返回实际发送成功的数量。
   */
  private dispatchMessage(
    message: BusMessage,
    result: Awaited<ReturnType<NeuralCoreService['route']>>,
  ): number {
    let sentCount = 0;

    for (const target of result.targets) {
      const ok = this.wsGateway.sendToConnection(
        target.connectionId,
        'message',
        message,
      );
      if (ok) sentCount++;
    }

    for (const sub of result.subscribers) {
      const ok = this.wsGateway.sendToConnection(
        sub.connectionId,
        'message',
        message,
      );
      if (ok) sentCount++;
    }

    return sentCount;
  }
}
