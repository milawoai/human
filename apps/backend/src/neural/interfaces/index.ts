/**
 * Neural Core 类型定义
 * 统一消息模型与核心数据结构
 */

/** 消息类型 */
export type MessageKind =
  | 'command'
  | 'query'
  | 'control'
  | 'event'
  | 'response'
  | 'error';

/** 运行时环境 */
export type Runtime = 'electron' | 'nest' | 'python';

/** 系统名称 */
export type SystemName = 'sensory' | 'neural' | 'brain' | 'motor' | 'body';

/** Actor 引用 — 标识消息的发送方 / 接收方 */
export interface ActorRef {
  actorId: string;
  runtime: Runtime;
  system: SystemName;
  module?: string;
}

/** 总线消息 — 系统间唯一的通信载体 */
export interface BusMessage<T = unknown> {
  id: string;
  kind: MessageKind;
  topic: string;

  source: ActorRef;
  target?: ActorRef;

  timestamp: number;

  /** 关联 ID — 用于 request/response 链路追踪 */
  correlationId?: string;
  /** 因果 ID — 标识触发当前消息的原始消息 */
  causationId?: string;

  payload: T;
}

/** 能力模式 */
export type CapabilityMode = 'once' | 'stream';

/** 能力 — 描述某个 Actor 可以处理什么 topic */
export interface Capability {
  id: string;
  actor: ActorRef;

  topic: string;
  kinds?: ('command' | 'query' | 'control')[];

  mode: CapabilityMode;

  enabled: boolean;
  online: boolean;

  priority?: number;
}

/** 订阅 — 描述某个 Actor 想接收什么 topic 的事件 */
export interface Subscription {
  id: string;
  subscriber: ActorRef;
  topics: string[];
  kinds?: MessageKind[];
}

/** Actor 状态 */
export interface ActorState {
  actor: ActorRef;
  connected: boolean;
  lastHeartbeatAt?: number;
  connectionId?: string;
}
