# Neural Core（代码对齐版）

更新日期：2026-04-28  
代码基线：`apps/backend/src/neural`

## 概述

Neural Core 是系统内统一通信中枢，负责：

- 统一消息模型（`BusMessage`）
- 统一路由策略（定向 / 广播 / 回送）
- 管理 Actor / Capability / Subscription 的运行态
- 提供 HTTP + WS 两种接入

明确边界：

- Neural Core 不承载业务逻辑
- Brain / Motor / Sensory 通过 topic 解耦
- 子系统间通信应经由 Neural Core

## 当前代码结构（实际实现）

```text
apps/backend/src/neural/
├── interfaces/
│   └── index.ts
├── neural-core/
│   ├── neural-core.module.ts
│   └── neural-core.service.ts
├── neural-ws/
│   ├── neural-ws.module.ts
│   └── neural-ws.gateway.ts
├── neural-http/
│   ├── neural-http.module.ts
│   ├── neural-http.controller.ts
│   └── neural-http.service.ts
└── neural.module.ts
```

说明：当前实现是“单服务内存态总线”，未拆成 `bus/registry/router` 多服务。

## 数据模型（以代码为准）

### MessageKind

- `command`
- `query`
- `control`
- `event`
- `response`
- `error`

### ActorRef

```ts
{
  actorId: string
  runtime: 'electron' | 'nest' | 'python'
  system: 'sensory' | 'neural' | 'brain' | 'motor' | 'body'
  module?: string
}
```

### BusMessage

```ts
{
  id: string
  kind: MessageKind
  topic: string
  source: ActorRef
  target?: ActorRef
  timestamp: number
  correlationId?: string
  causationId?: string
  payload: unknown
}
```

### Capability

```ts
{
  id: string
  actor: ActorRef
  topic: string
  kinds?: ('command' | 'query' | 'control')[]
  mode: 'once' | 'stream'
  enabled: boolean
  online: boolean
  priority?: number
}
```

### Subscription

```ts
{
  id: string
  subscriber: ActorRef
  topics: string[]
  kinds?: MessageKind[]
}
```

## 运行态存储（内存）

在 `NeuralCoreService` 内维护：

- `actors: Map<actorId, ActorState>`
- `capabilities: Map<capabilityId, Capability>`
- `subscriptions: Map<subscriptionId, Subscription>`
- `connectionMap: Map<connectionId, actorId>`

生命周期：

- `registerActor/registerInternalActor`：上线并标记 capability online
- `unregisterActor`：离线并标记 capability offline
- `cleanupStaleActors(timeoutMs)`：按心跳超时清理

## 路由规则（当前实现）

总入口：`route(message: BusMessage)`

### `command` / `control` / `query`

定向路由：

1. 若 `message.target` 存在且在线，直发
2. 否则按 capability 匹配 `topic + kind`
3. 仅保留 `online && enabled`
4. 精确 topic 优先，否则取第一个候选

### `event`

广播路由：

1. 按订阅匹配 `topic + kind`
2. 仅推送在线订阅者
3. 按 `connectionId` 去重后发送

### `response` / `error`

回送路由：

1. 有 `target` 且在线则直发
2. 否则尝试回给 `message.source`
3. 否则告警并丢弃

### topic 匹配

支持：

- 精确匹配
- 含 `*` 的段级通配（如 `sensory.*.enable`）
- 末尾 `.*` 可匹配多层

## 传输层职责

### HTTP（`/neural`）

- `POST /trigger`：触发消息
- `POST /actors/list`
- `POST /capabilities/list`
- `POST /subscriptions/list`
- `POST /admin/cleanup`
- `POST /admin/disconnect`
- `POST /debug/publish`
- `POST /debug/status`

### WebSocket（namespace: `/neural`）

- `register`
- `register_capabilities`
- `heartbeat`
- `subscribe`
- `unsubscribe`
- `message`

## 内部 Actor 执行路径（Nest Runtime）

`NeuralHttpService.trigger` 会在路由前做特殊分流：

- `query` 且目标 actor 是 `python`：走 HTTP 中转到 `http://localhost:12003/neural/query`
- `command/query` 且目标 actor 是 `nest`：走 `InternalCommandHandler`
- 其他消息：走常规 WS 分发

这意味着当前 Neural Core 实际是“总线 + 进程内调度混合实现”。

## 与历史设计稿的差异

以下设计点在历史文档中出现，但当前代码未实现或不一致：

1. 未拆分独立 `bus.service / router.service / registry.service`
2. 未实现显式 `ack` 协议
3. `stream` 不是独立 `MessageKind`（当前仅 `Capability.mode='stream'`）
4. `response/error` 未基于 `correlationId` 查链路回源，当前为 `target` 优先、其次 `source`
5. 某些 `*_requested` 语义属于上层业务约定，Neural 层不强制

## Topic 变更约定

新增 topic 时，必须同步维护：

- `packages/neural-topics/src/index.ts`
- `packages/neural-topics/topics.json`
- `packages/neural-topics/python/neural_topics.py`

## 一句话总结

当前 Neural Core 是一个可用的 v1 通信中枢：以统一消息模型为核心，支持 HTTP/WS 接入、能力路由、订阅广播和 Nest 内部命令分发。
