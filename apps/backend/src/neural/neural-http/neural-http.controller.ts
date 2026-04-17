/**
 * NeuralHttpController — HTTP 接口
 *
 * 职责：
 * - 触发类：启动/停止能力、执行 command
 * - 查询类：actors / capabilities / subscriptions
 * - 管理类：清理 actor、强制断开
 * - 调试类：手动 publish
 */
import { Body, Controller, Get, Logger, Post } from '@nestjs/common';
import { BusMessage, Capability, MessageKind } from '../interfaces';
import { NeuralCoreService } from '../neural-core/neural-core.service';
import { NeuralWsGateway } from '../neural-ws/neural-ws.gateway';

@Controller('neural')
export class NeuralHttpController {
  private readonly logger = new Logger(NeuralHttpController.name);

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly wsGateway: NeuralWsGateway,
  ) {}

  // ──────────────────────────────────────────────
  // 触发类
  // ──────────────────────────────────────────────

  /**
   * 触发消息 — 统一入口
   * Electron / 外部系统通过 HTTP POST 触发一次性的 command / control / query
   */
  @Post('trigger')
  trigger(
    @Body()
    body: {
      kind: MessageKind;
      topic: string;
      payload?: any;
      source?: { runtime: string; system: string; module?: string };
      target?: { actorId: string; runtime: string; system: string; module?: string };
    },
  ) {
    const message: BusMessage = {
      id: crypto.randomUUID(),
      kind: body.kind,
      topic: body.topic,
      source: body.source as any ?? {
        actorId: 'neural-http',
        runtime: 'nest',
        system: 'neural',
      },
      target: body.target as any ?? undefined,
      timestamp: Date.now(),
      payload: body.payload ?? {},
    };

    this.logger.log(`HTTP 触发: kind=${message.kind}, topic=${message.topic}`);

    // 路由
    const result = this.coreService.route(message);

    let sentCount = 0;

    // 定向发送
    for (const target of result.targets) {
      const ok = this.wsGateway.sendToConnection(
        target.connectionId,
        'message',
        message,
      );
      if (ok) sentCount++;
    }

    // 广播给订阅者
    for (const sub of result.subscribers) {
      const ok = this.wsGateway.sendToConnection(
        sub.connectionId,
        'message',
        message,
      );
      if (ok) sentCount++;
    }

    return {
      success: true,
      messageId: message.id,
      sentTo: sentCount,
    };
  }

  // ──────────────────────────────────────────────
  // 查询类
  // ──────────────────────────────────────────────

  /** 查询所有 Actor */
  @Post('actors/list')
  listActors() {
    return {
      success: true,
      data: this.coreService.getAllActors(),
    };
  }

  /** 查询所有能力 */
  @Post('capabilities/list')
  listCapabilities(
    @Body() body?: { topic?: string; kind?: MessageKind },
  ) {
    if (body?.topic) {
      return {
        success: true,
        data: this.coreService.findCapabilities(body.topic, body.kind),
      };
    }

    return {
      success: true,
      data: this.coreService.getAllCapabilities(),
    };
  }

  /** 查询所有订阅 */
  @Post('subscriptions/list')
  listSubscriptions() {
    return {
      success: true,
      data: this.coreService.getAllSubscriptions(),
    };
  }

  // ──────────────────────────────────────────────
  // 管理类
  // ──────────────────────────────────────────────

  /** 清理失活 Actor */
  @Post('admin/cleanup')
  cleanupStaleActors(
    @Body() body?: { timeoutMs?: number },
  ) {
    const timeout = body?.timeoutMs ?? 60_000; // 默认 60s
    const cleaned = this.coreService.cleanupStaleActors(timeout);
    return {
      success: true,
      cleaned,
      count: cleaned.length,
    };
  }

  /** 强制断开 Actor */
  @Post('admin/disconnect')
  disconnectActor(@Body() body: { actorId: string }) {
    const ok = this.wsGateway.disconnectActor(body.actorId);
    return {
      success: ok,
      actorId: body.actorId,
    };
  }

  // ──────────────────────────────────────────────
  // 调试类
  // ──────────────────────────────────────────────

  /** 手动发布消息 */
  @Post('debug/publish')
  debugPublish(
    @Body()
    body: {
      kind: MessageKind;
      topic: string;
      payload?: any;
    },
  ) {
    const message: BusMessage = {
      id: crypto.randomUUID(),
      kind: body.kind,
      topic: body.topic,
      source: {
        actorId: 'neural-debug',
        runtime: 'nest',
        system: 'neural',
      },
      timestamp: Date.now(),
      payload: body.payload ?? {},
    };

    this.logger.debug(`调试发布: ${JSON.stringify(body)}`);

    const result = this.coreService.route(message);

    let sentCount = 0;

    for (const target of result.targets) {
      const ok = this.wsGateway.sendToConnection(target.connectionId, 'message', message);
      if (ok) sentCount++;
    }

    for (const sub of result.subscribers) {
      const ok = this.wsGateway.sendToConnection(sub.connectionId, 'message', message);
      if (ok) sentCount++;
    }

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

  /** 查询连接状态 */
  @Post('debug/status')
  debugStatus() {
    return {
      success: true,
      actors: this.coreService.getAllActors().length,
      capabilities: this.coreService.getAllCapabilities().length,
      subscriptions: this.coreService.getAllSubscriptions().length,
      wsConnections: this.wsGateway.getConnectedCount(),
    };
  }
}
