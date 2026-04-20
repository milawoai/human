/**
 * NeuralHttpService — HTTP 业务逻辑层
 *
 * 封装消息触发、查询、管理、调试等业务逻辑，
 * Controller 仅做路由转发。
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import type { BusMessage, MessageKind } from '../interfaces';
import { NeuralCoreService } from '../neural-core/neural-core.service';
import { NeuralWsGateway } from '../neural-ws/neural-ws.gateway';

const PYTHON_SERVICE_URL = 'http://localhost:12003';

@Injectable()
export class NeuralHttpService {
  private readonly logger = new Logger(NeuralHttpService.name);

  constructor(
    private readonly coreService: NeuralCoreService,
    private readonly wsGateway: NeuralWsGateway,
  ) {}

  // ──────────────────────────────────────────────
  // 触发类
  // ──────────────────────────────────────────────

  /**
   * 触发消息 — 构造 BusMessage、路由、发送。
   * 返回发送结果。
   */
  trigger(params: {
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

    this.logger.log(`HTTP 触发: kind=${message.kind}, topic=${message.topic}`);

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

  /** 中转：获取 Python ASR 模型列表 */
  async listAsrModels() {
    try {
      const res = await axios.get(`${PYTHON_SERVICE_URL}/api/v1/asr/models`);
      return res.data;
    } catch (error) {
      this.logger.error('获取 ASR 模型列表失败:', error.message);
      return { success: false, error: 'Python 服务不可用', models: [] };
    }
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
