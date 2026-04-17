/**
 * NeuralCoreService — Neural Core 核心服务
 *
 * 职责：
 * - 维护 Actor / Capability / Subscription 的内存状态
 * - 执行消息路由（定向 / 广播 / 回源 / stream）
 * - 不承载任何业务逻辑
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  ActorRef,
  ActorState,
  BusMessage,
  Capability,
  MessageKind,
  Subscription,
} from '../interfaces';

/** 消息分发目标 */
export interface DispatchTarget {
  connectionId: string;
  actor: ActorRef;
}

/** 路由结果 */
export interface RouteResult {
  /** 需要定向发送的目标 */
  targets: DispatchTarget[];
  /** 需要广播的订阅者 */
  subscribers: DispatchTarget[];
}

@Injectable()
export class NeuralCoreService {
  private readonly logger = new Logger(NeuralCoreService.name);

  // ──────────────────────────────────────────────
  // 内存存储
  // ──────────────────────────────────────────────

  /** actorId → ActorState */
  private readonly actors = new Map<string, ActorState>();

  /** capabilityId → Capability */
  private readonly capabilities = new Map<string, Capability>();

  /** subscriptionId → Subscription */
  private readonly subscriptions = new Map<string, Subscription>();

  /** connectionId → actorId （WS 连接映射） */
  private readonly connectionMap = new Map<string, string>();

  // ──────────────────────────────────────────────
  // Actor 管理
  // ──────────────────────────────────────────────

  /** 注册 Actor，返回是否为新注册 */
  registerActor(actor: ActorRef, connectionId: string): boolean {
    const existing = this.actors.get(actor.actorId);
    if (existing) {
      // 已存在 → 更新连接信息
      existing.connected = true;
      existing.connectionId = connectionId;
      existing.lastHeartbeatAt = Date.now();
      this.connectionMap.set(connectionId, actor.actorId);

      // 将该 actor 的所有 capability 标记为 online
      this.setOnlineByActor(actor.actorId, true);

      this.logger.log(`Actor 重新连接: ${actor.actorId}`);
      return false;
    }

    const state: ActorState = {
      actor,
      connected: true,
      connectionId,
      lastHeartbeatAt: Date.now(),
    };
    this.actors.set(actor.actorId, state);
    this.connectionMap.set(connectionId, actor.actorId);
    this.logger.log(`Actor 注册: ${actor.actorId} (${actor.runtime}/${actor.system})`);
    return true;
  }

  /** 注销 Actor（断开连接时调用） */
  unregisterActor(actorId: string): void {
    const state = this.actors.get(actorId);
    if (!state) return;

    state.connected = false;
    // 清除连接映射
    if (state.connectionId) {
      this.connectionMap.delete(state.connectionId);
    }
    state.connectionId = undefined;

    // 将该 actor 的所有 capability 标记为 offline
    this.setOnlineByActor(actorId, false);

    this.logger.log(`Actor 断开: ${actorId}`);
  }

  /** 通过 connectionId 查找 actorId */
  getActorIdByConnection(connectionId: string): string | undefined {
    return this.connectionMap.get(connectionId);
  }

  /** 通过 actorId 获取 ActorState */
  getActorState(actorId: string): ActorState | undefined {
    return this.actors.get(actorId);
  }

  /** 获取所有 Actor 状态列表 */
  getAllActors(): ActorState[] {
    return Array.from(this.actors.values());
  }

  /** 更新心跳时间 */
  heartbeat(actorId: string): void {
    const state = this.actors.get(actorId);
    if (state) {
      state.lastHeartbeatAt = Date.now();
    }
  }

  /** 清理长时间未心跳的 actor */
  cleanupStaleActors(timeoutMs: number): string[] {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [actorId, state] of this.actors) {
      if (!state.connected) continue;
      if (state.lastHeartbeatAt && now - state.lastHeartbeatAt > timeoutMs) {
        staleIds.push(actorId);
      }
    }

    for (const id of staleIds) {
      this.unregisterActor(id);
    }

    if (staleIds.length > 0) {
      this.logger.warn(`清理 ${staleIds.length} 个失活 Actor: ${staleIds.join(', ')}`);
    }

    return staleIds;
  }

  // ──────────────────────────────────────────────
  // Capability Registry
  // ──────────────────────────────────────────────

  /** 注册能力列表 */
  registerCapabilities(capabilities: Capability[]): void {
    for (const cap of capabilities) {
      const existing = this.capabilities.get(cap.id);
      if (existing) {
        // 更新已有能力
        Object.assign(existing, cap);
        existing.online = this.actors.get(cap.actor.actorId)?.connected ?? false;
        this.logger.debug(`能力更新: ${cap.id}`);
      } else {
        // 新增能力
        this.capabilities.set(cap.id, {
          ...cap,
          online: this.actors.get(cap.actor.actorId)?.connected ?? false,
        });
        this.logger.log(`能力注册: ${cap.id} (${cap.topic})`);
      }
    }
  }

  /** 注销指定 actor 的所有能力 */
  unregisterCapabilitiesByActor(actorId: string): void {
    for (const [capId, cap] of this.capabilities) {
      if (cap.actor.actorId === actorId) {
        this.capabilities.delete(capId);
        this.logger.log(`能力注销: ${capId}`);
      }
    }
  }

  /** 查询能力 — 支持 topic 精确匹配、前缀匹配、通配符 */
  findCapabilities(topic: string, kind?: MessageKind): Capability[] {
    const results: Capability[] = [];

    for (const cap of this.capabilities.values()) {
      if (!cap.online || !cap.enabled) continue;
      if (kind && cap.kinds && !cap.kinds.includes(kind as any)) continue;
      if (!this.topicMatches(cap.topic, topic)) continue;

      results.push(cap);
    }

    return results;
  }

  /** 获取所有能力 */
  getAllCapabilities(): Capability[] {
    return Array.from(this.capabilities.values());
  }

  // ──────────────────────────────────────────────
  // Subscription 管理
  // ──────────────────────────────────────────────

  /** 添加订阅 */
  addSubscription(subscription: Subscription): void {
    this.subscriptions.set(subscription.id, subscription);
    this.logger.log(
      `订阅注册: ${subscription.subscriber.actorId} → [${subscription.topics.join(', ')}]`,
    );
  }

  /** 移除订阅 */
  removeSubscription(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
  }

  /** 移除指定 actor 的所有订阅 */
  removeSubscriptionsByActor(actorId: string): void {
    for (const [subId, sub] of this.subscriptions) {
      if (sub.subscriber.actorId === actorId) {
        this.subscriptions.delete(subId);
      }
    }
  }

  /** 查找匹配某个 topic 的订阅者 */
  findSubscribers(topic: string, kind?: MessageKind): DispatchTarget[] {
    const targets: DispatchTarget[] = [];

    for (const sub of this.subscriptions.values()) {
      // 检查 topic 匹配
      const topicMatch = sub.topics.some((t) => this.topicMatches(t, topic));
      if (!topicMatch) continue;

      // 检查 kind 过滤
      if (kind && sub.kinds && !sub.kinds.includes(kind)) continue;

      // 检查订阅者在线
      const state = this.actors.get(sub.subscriber.actorId);
      if (!state?.connected || !state.connectionId) continue;

      targets.push({
        connectionId: state.connectionId,
        actor: sub.subscriber,
      });
    }

    return targets;
  }

  /** 获取所有订阅 */
  getAllSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  // ──────────────────────────────────────────────
  // Routing — 核心路由逻辑
  // ──────────────────────────────────────────────

  /**
   * 路由消息
   *
   * 规则：
   * 1. command / control / query → 定向路由（查 Capability Registry）
   * 2. event → 广播（查 Subscription）
   * 3. response / error → 回源（根据 correlationId 找原始 source）
   * 4. stream → 按 event 处理（广播）
   */
  route(message: BusMessage): RouteResult {
    this.logger.debug(`路由消息: kind=${message.kind}, topic=${message.topic}`);

    switch (message.kind) {
      case 'command':
      case 'control':
      case 'query':
        return this.routeDirected(message);

      case 'event':
        return this.routeBroadcast(message, 'event');

      case 'response':
      case 'error':
        return this.routeReply(message);

      default:
        this.logger.warn(`未知消息类型: ${message.kind}`);
        return { targets: [], subscribers: [] };
    }
  }

  /** 定向路由：command / control / query */
  private routeDirected(message: BusMessage): RouteResult {
    const targets: DispatchTarget[] = [];

    // 优先级 1：target 存在 → 直接发送
    if (message.target) {
      const state = this.actors.get(message.target.actorId);
      if (state?.connected && state.connectionId) {
        targets.push({
          connectionId: state.connectionId,
          actor: message.target,
        });
        return { targets, subscribers: [] };
      }
      this.logger.warn(`目标 Actor 不在线: ${message.target.actorId}`);
    }

    // 优先级 2-6：查 Capability Registry
    const capabilities = this.findCapabilities(message.topic, message.kind);

    if (capabilities.length === 0) {
      this.logger.warn(`无可用能力处理: topic=${message.topic}, kind=${message.kind}`);
      return { targets: [], subscribers: [] };
    }

    // 精确匹配优先
    const exact = capabilities.find((c) => c.topic === message.topic);
    const selected = exact ?? capabilities[0];

    const state = this.actors.get(selected.actor.actorId);
    if (state?.connected && state.connectionId) {
      targets.push({
        connectionId: state.connectionId,
        actor: selected.actor,
      });
    }

    return { targets, subscribers: [] };
  }

  /** 广播路由：event / stream */
  private routeBroadcast(message: BusMessage, kind: MessageKind): RouteResult {
    const subscribers = this.findSubscribers(message.topic, kind);
    return { targets: [], subscribers };
  }

  /** 回源路由：response / error */
  private routeReply(message: BusMessage): RouteResult {
    // 如果有 target，直接回
    if (message.target) {
      const state = this.actors.get(message.target.actorId);
      if (state?.connected && state.connectionId) {
        return {
          targets: [{
            connectionId: state.connectionId,
            actor: message.target,
          }],
          subscribers: [],
        };
      }
    }

    // 如果有 correlationId，尝试通过 source 回
    if (message.source) {
      const state = this.actors.get(message.source.actorId);
      if (state?.connected && state.connectionId) {
        return {
          targets: [{
            connectionId: state.connectionId,
            actor: message.source,
          }],
          subscribers: [],
        };
      }
    }

    this.logger.warn(`无法回送消息: topic=${message.topic}, correlationId=${message.correlationId}`);
    return { targets: [], subscribers: [] };
  }

  // ──────────────────────────────────────────────
  // Topic 匹配工具
  // ──────────────────────────────────────────────

  /**
   * 判断 pattern 是否匹配 topic
   *
   * 支持三种模式：
   * - 精确匹配：sensory.hearing.caption_stream.enable
   * - 前缀通配符：sensory.hearing.*（匹配 sensory.hearing 下所有 topic）
   * - 多级通配符：sensory.*.enable（匹配 sensory 任意模块的 enable）
   */
  private topicMatches(pattern: string, topic: string): boolean {
    // 精确匹配
    if (pattern === topic) return true;

    // 通配符匹配
    if (pattern.includes('*')) {
      const regexStr = pattern
        .split('.')
        .map((seg) => (seg === '*' ? '[^.]+?' : seg))
        .join('\\.');
      // 末尾是 * 时允许匹配多层
      const fullRegex = pattern.endsWith('.*')
        ? `^${regexStr}(\\.[^.]+)*$`
        : `^${regexStr}$`;

      return new RegExp(fullRegex).test(topic);
    }

    return false;
  }

  /** 批量设置 actor 所有能力的在线状态 */
  private setOnlineByActor(actorId: string, online: boolean): void {
    for (const cap of this.capabilities.values()) {
      if (cap.actor.actorId === actorId) {
        cap.online = online;
      }
    }
  }
}
