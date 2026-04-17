/**
 * NeuralWsGateway — WebSocket 网关
 *
 * 职责：
 * - 连接管理（register / disconnect / heartbeat）
 * - 总线消息收发（subscribe / unsubscribe / event / response / error / stream）
 * - 将所有 WS 消息统一转为 BusMessage 交给 NeuralCoreService 路由
 */
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type {
  ActorRef,
  BusMessage,
  Capability,
  MessageKind,
  Subscription,
} from '../interfaces';
import { NeuralCoreService } from '../neural-core/neural-core.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/neural',
})
export class NeuralWsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NeuralWsGateway.name);

  /** connectionId → actorId 映射（在 service 中也有，这里用于快速查找） */
  private readonly socketActorMap = new Map<string, string>();

  constructor(private readonly coreService: NeuralCoreService) {}

  afterInit() {
    this.logger.log('Neural WS Gateway 初始化完成');
  }

  // ──────────────────────────────────────────────
  // 连接生命周期
  // ──────────────────────────────────────────────

  handleConnection(client: Socket) {
    this.logger.log(`WS 连接建立: ${client.id}`);
    client.emit('connected', {
      success: true,
      message: 'Connected to Neural Core',
      connectionId: client.id,
      timestamp: Date.now(),
    });
  }

  handleDisconnect(client: Socket) {
    const actorId = this.socketActorMap.get(client.id);

    if (actorId) {
      this.coreService.unregisterActor(actorId);
      this.coreService.removeSubscriptionsByActor(actorId);
      this.socketActorMap.delete(client.id);
    }

    this.logger.log(`WS 连接断开: ${client.id}`);
  }

  // ──────────────────────────────────────────────
  // 总线协议：register
  // ──────────────────────────────────────────────

  @SubscribeMessage('register')
  handleRegister(
    @MessageBody() data: { actor: ActorRef },
    @ConnectedSocket() client: Socket,
  ): void {
    const actor = data.actor;
    if (!actor?.actorId || !actor?.runtime || !actor?.system) {
      client.emit('error', {
        topic: 'neural.bus.register',
        payload: { error: 'actorId, runtime, system 为必填字段' },
      });
      return;
    }

    this.socketActorMap.set(client.id, actor.actorId);
    this.coreService.registerActor(actor, client.id);

    client.emit('registered', {
      success: true,
      actorId: actor.actorId,
      timestamp: Date.now(),
    });

    this.logger.log(`Actor 注册成功: ${actor.actorId} (connection: ${client.id})`);
  }

  // ──────────────────────────────────────────────
  // 总线协议：register_capabilities
  // ──────────────────────────────────────────────

  @SubscribeMessage('register_capabilities')
  handleRegisterCapabilities(
    @MessageBody() data: { capabilities: Capability[] },
    @ConnectedSocket() client: Socket,
  ): void {
    this.coreService.registerCapabilities(data.capabilities || []);

    client.emit('capabilities_registered', {
      success: true,
      count: data.capabilities?.length ?? 0,
      timestamp: Date.now(),
    });
  }

  // ──────────────────────────────────────────────
  // 总线协议：heartbeat
  // ──────────────────────────────────────────────

  @SubscribeMessage('heartbeat')
  handleHeartbeat(@ConnectedSocket() client: Socket): void {
    const actorId = this.socketActorMap.get(client.id);
    if (actorId) {
      this.coreService.heartbeat(actorId);
    }
    client.emit('heartbeat_ack', { timestamp: Date.now() });
  }

  // ──────────────────────────────────────────────
  // 总线协议：subscribe / unsubscribe
  // ──────────────────────────────────────────────

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { topics: string[]; kinds?: MessageKind[] },
    @ConnectedSocket() client: Socket,
  ): void {
    const actorId = this.socketActorMap.get(client.id);
    if (!actorId) {
      client.emit('error', {
        topic: 'neural.bus.subscribe',
        payload: { error: '请先注册 (register)' },
      });
      return;
    }

    const state = this.coreService.getActorState(actorId);
    if (!state) return;

    const subscription: Subscription = {
      id: `sub-${crypto.randomUUID()}-${actorId}`,
      subscriber: state.actor,
      topics: data.topics,
      kinds: data.kinds,
    };

    this.coreService.addSubscription(subscription);

    client.emit('subscribed', {
      success: true,
      subscriptionId: subscription.id,
      topics: data.topics,
      timestamp: Date.now(),
    });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { subscriptionId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    this.coreService.removeSubscription(data.subscriptionId);

    client.emit('unsubscribed', {
      success: true,
      subscriptionId: data.subscriptionId,
      timestamp: Date.now(),
    });
  }

  // ──────────────────────────────────────────────
  // 总线消息：message（通用消息入口）
  // ──────────────────────────────────────────────

  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: BusMessage,
    @ConnectedSocket() client: Socket,
  ): void {
    const actorId = this.socketActorMap.get(client.id);

    // 补充 source 信息（如果未提供）
    if (actorId && !data.source?.actorId) {
      const state = this.coreService.getActorState(actorId);
      if (state) {
        data.source = state.actor;
      }
    }

    // 补充时间戳
    if (!data.timestamp) {
      data.timestamp = Date.now();
    }

    // 补充消息 ID
    if (!data.id) {
      data.id = crypto.randomUUID();
    }

    this.logger.debug(
      `收到消息: kind=${data.kind}, topic=${data.topic}, from=${data.source?.actorId ?? 'unknown'}`,
    );

    // 路由
    const result = this.coreService.route(data);

    // 定向发送
    for (const target of result.targets) {
      this.sendToConnection(target.connectionId, 'message', data);
    }

    // 广播给订阅者
    for (const sub of result.subscribers) {
      this.sendToConnection(sub.connectionId, 'message', data);
    }
  }

  // ──────────────────────────────────────────────
  // 公共方法：向指定连接推送消息
  // ──────────────────────────────────────────────

  /**
   * 向指定 connectionId 发送消息
   * 供 HTTP Controller / 其他 Service 调用
   */
  sendToConnection(connectionId: string, event: string, data: any): boolean {
    const socket = this.server.sockets.sockets.get(connectionId);
    if (!socket) {
      this.logger.warn(`Socket 不存在: ${connectionId}`);
      return false;
    }

    socket.emit(event, data);
    return true;
  }

  /**
   * 向指定 actorId 发送消息
   */
  sendToActor(actorId: string, event: string, data: any): boolean {
    const state = this.coreService.getActorState(actorId);
    if (!state?.connectionId) {
      this.logger.warn(`Actor 不在线或无连接: ${actorId}`);
      return false;
    }

    return this.sendToConnection(state.connectionId, event, data);
  }

  /**
   * 广播消息到所有连接
   */
  broadcast(event: string, data: any): void {
    this.server.emit(event, data);
  }

  /**
   * 强制断开指定 actor 的连接
   */
  disconnectActor(actorId: string): boolean {
    const state = this.coreService.getActorState(actorId);
    if (!state?.connectionId) return false;

    const socket = this.server.sockets.sockets.get(state.connectionId);
    if (socket) {
      socket.disconnect(true);
    }

    this.coreService.unregisterActor(actorId);
    this.coreService.removeSubscriptionsByActor(actorId);
    this.socketActorMap.delete(state.connectionId);
    return true;
  }

  /**
   * 获取当前连接数
   */
  getConnectedCount(): number {
    return this.socketActorMap.size;
  }
}
