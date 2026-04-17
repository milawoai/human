# Neural Core — 接口与使用文档

## 概述

Neural Core 是系统的**通信中枢（Message Bus）**，运行在 NestJS 后端（端口 `12002`）。

核心定位：

```
统一消息入口 + 路由中心 + 订阅中心 + 协议层
```

所有子系统（Electron / Python / NestJS 内部）之间的通信**必须经过 Neural Core**，不允许直连。

---

## 架构

```
┌──────────┐              ┌──────────────────┐              ┌──────────┐
│ Electron │  HTTP(触发)   │                  │   WS(长连接)  │  Python  │
│  (Body)  │──────────────►│                  │◄─────────────►│(Sensory) │
│          │  WS(订阅/推送) │  Neural Core     │              │          │
│          │◄─────────────►│  (NestJS :12002) │              └──────────┘
└──────────┘              │                  │              ┌──────────┐
                          │                  │  Local 调用   │  NestJS  │
                          │                  │◄─────────────►│ (Brain)  │
                          └──────────────────┘              └──────────┘
```

### 通信方式

| 方式 | 用途 | 适用场景 |
|------|------|---------|
| HTTP POST | 一次性触发、查询、管理 | 启动/停止能力、查询状态 |
| WebSocket (Socket.IO) | 注册、订阅、事件流、长连接 | 持续接收数据、推送事件 |
| Local Adapter | NestJS 内部调用 | Brain / Motor 直接调用总线 |

---

## 目录结构

```
apps/backend/src/neural/
├── interfaces/
│   └── index.ts                  # 核心类型定义
├── neural-core/
│   ├── neural-core.module.ts     # 核心模块（@Global）
│   └── neural-core.service.ts    # 核心服务：Actor/Capability/Subscription 管理 + Routing
├── neural-ws/
│   ├── neural-ws.module.ts       # WS 模块
│   └── neural-ws.gateway.ts      # Socket.IO Gateway（namespace: /neural）
├── neural-http/
│   ├── neural-http.module.ts     # HTTP 模块
│   └── neural-http.controller.ts # HTTP Controller
└── neural.module.ts              # 总模块入口
```

---

## 核心类型

### BusMessage（统一消息信封）

```ts
interface BusMessage<T = unknown> {
  id: string                       // 消息唯一 ID
  kind: MessageKind                // 消息类型
  topic: string                    // 路由地址（system.module.entity.verb）
  source: ActorRef                 // 发送方
  target?: ActorRef                // 接收方（可选，定向发送时使用）
  timestamp: number                // 时间戳
  correlationId?: string           // 关联 ID（request/response 链路追踪）
  causationId?: string             // 因果 ID（触发链路追踪）
  payload: T                       // 消息内容
}
```

### MessageKind（消息类型）

| 类型 | 含义 | 路由策略 |
|------|------|---------|
| `command` | 请求执行一次动作 | 定向路由（查 Capability → 发给对应 Actor） |
| `query` | 查询请求 | 定向路由 |
| `control` | 控制能力状态（启动/停止） | 定向路由 |
| `event` | 事实广播 | 广播（查 Subscription → 推给所有订阅者） |
| `response` | 成功响应 | 回源（根据 target/correlationId 返回给请求方） |
| `error` | 错误响应 | 回源 |

### ActorRef（Actor 标识）

```ts
interface ActorRef {
  actorId: string                  // Actor 唯一 ID
  runtime: 'electron' | 'nest' | 'python'
  system: 'sensory' | 'neural' | 'brain' | 'motor' | 'body'
  module?: string                  // 模块名
}
```

### Capability（能力注册）

```ts
interface Capability {
  id: string
  actor: ActorRef
  topic: string                    // 能处理的 topic
  kinds?: ('command' | 'query' | 'control')[]
  mode: 'once' | 'stream'
  enabled: boolean
  online: boolean
  priority?: number
}
```

### Subscription（订阅）

```ts
interface Subscription {
  id: string
  subscriber: ActorRef
  topics: string[]                 // 订阅的 topic 列表（支持通配符）
  kinds?: MessageKind[]            // 过滤消息类型
}
```

---

## Topic 命名规范

```
<system>.<module>.<entity>.<verb>
```

| 层级 | 含义 | 示例 |
|------|------|------|
| `system` | 子系统 | `sensory` / `brain` / `motor` / `body` |
| `module` | 模块 | `hearing` / `tts` / `ui` |
| `entity` | 实体 | `caption_stream` / `speak` |
| `verb` | 动作 | `enable` / `segment` / `started` |

### 通配符

| pattern | 匹配 |
|---------|------|
| `sensory.hearing.caption_stream.segment` | 精确匹配 |
| `sensory.hearing.caption_stream.*` | 匹配该实体下所有 verb |
| `sensory.hearing.*` | 匹配 hearing 模块下所有实体和 verb |

---

## 路由规则

| 消息类型 | 路由策略 | 说明 |
|---------|---------|------|
| `command` / `control` / `query` | **定向路由** | 查 Capability Registry → 匹配 topic + kind → 选在线 Actor → 定向发送 |
| `event` | **广播** | 查 Subscription → 匹配 topic → 推给所有订阅者 |
| `response` / `error` | **回源** | 优先 target → 其次 correlationId → 定向返回 |

### 选路优先级

1. `target` 存在 → 直接发送
2. 精确匹配 capability topic
3. `online = true` + `enabled = true`
4. 单候选直选 / 多候选取第一个

---

## HTTP 接口

基础路径：`http://localhost:12002/neural`

### 触发类

#### `POST /neural/trigger`

发送一次性消息，由 Neural Core 路由到目标 Actor。

```json
// Request
{
  "kind": "control",
  "topic": "sensory.hearing.caption_stream.enable",
  "payload": { "language": "zh-CN" }
}

// Response
{
  "success": true,
  "messageId": "xxx-xxx",
  "sentTo": 1  // 发送给了几个 Actor
}
```

### 查询类

#### `POST /neural/actors/list`

```json
// Response
{
  "success": true,
  "data": [
    {
      "actor": { "actorId": "body-main", "runtime": "electron", "system": "body" },
      "connected": true,
      "lastHeartbeatAt": 1713244800000,
      "connectionId": "socket-xxx"
    }
  ]
}
```

#### `POST /neural/capabilities/list`

```json
// Request（可选过滤）
{ "topic": "sensory.hearing", "kind": "control" }

// Response
{
  "success": true,
  "data": [
    {
      "id": "sensory.hearing.caption_stream",
      "actor": { "actorId": "sensory-hearing", "runtime": "python", "system": "sensory" },
      "topic": "sensory.hearing.caption_stream.enable",
      "kinds": ["control"],
      "mode": "stream",
      "enabled": true,
      "online": true
    }
  ]
}
```

#### `POST /neural/subscriptions/list`

```json
// Response
{
  "success": true,
  "data": [
    {
      "id": "sub-xxx",
      "subscriber": { "actorId": "body-main", "runtime": "electron", "system": "body" },
      "topics": ["sensory.hearing.caption_stream.*"],
      "kinds": ["event"]
    }
  ]
}
```

### 管理类

#### `POST /neural/admin/cleanup`

```json
// Request（可选）
{ "timeoutMs": 60000 }

// Response
{
  "success": true,
  "cleaned": ["sensory-hearing"],
  "count": 1
}
```

#### `POST /neural/admin/disconnect`

```json
// Request
{ "actorId": "sensory-hearing" }

// Response
{ "success": true, "actorId": "sensory-hearing" }
```

### 调试类

#### `POST /neural/debug/publish`

手动发布消息，返回路由结果（发给谁了）。

```json
// Request
{
  "kind": "event",
  "topic": "test.ping",
  "payload": { "message": "hello" }
}

// Response
{
  "success": true,
  "messageId": "xxx-xxx",
  "routeResult": {
    "targets": ["sensory-hearing"],
    "subscribers": ["body-main"]
  },
  "sentTo": 2
}
```

#### `POST /neural/debug/status`

```json
// Response
{
  "success": true,
  "actors": 3,
  "capabilities": 5,
  "subscriptions": 2,
  "wsConnections": 2
}
```

---

## WebSocket 接口

**地址**：`ws://localhost:12002/neural`（Socket.IO namespace）

### 连接流程

```
1. Socket.IO connect        → 服务端返回 connected 事件
2. emit('register')         → 注册 Actor 身份（必须第一个调用）
3. emit('register_capabilities') → 注册该 Actor 能处理的能力
4. emit('subscribe')        → 订阅感兴趣的 topic
5. emit('heartbeat')        → 定期心跳保活（建议 30s）
```

### 事件协议

#### `register` — 注册 Actor 身份

```js
// Client → Server
socket.emit('register', {
  actor: {
    actorId: 'body-main',
    runtime: 'electron',
    system: 'body',
    module: 'main'
  }
})

// Server → Client
socket.on('registered', {
  success: true,
  actorId: 'body-main',
  timestamp: 1713244800000
})
```

#### `register_capabilities` — 注册能力

```js
// Client → Server
socket.emit('register_capabilities', {
  capabilities: [{
    id: 'sensory.hearing.caption_stream',
    actor: { actorId: 'sensory-hearing', runtime: 'python', system: 'sensory', module: 'hearing' },
    topic: 'sensory.hearing.caption_stream.enable',
    kinds: ['control'],
    mode: 'stream',
    enabled: true,
    online: true
  }]
})

// Server → Client
socket.on('capabilities_registered', {
  success: true,
  count: 1,
  timestamp: 1713244800000
})
```

#### `heartbeat` — 心跳保活

```js
// Client → Server
socket.emit('heartbeat')

// Server → Client
socket.on('heartbeat_ack', { timestamp: 1713244800000 })
```

#### `subscribe` / `unsubscribe` — 订阅管理

```js
// Client → Server
socket.emit('subscribe', {
  topics: ['sensory.hearing.caption_stream.*'],
  kinds: ['event']
})

// Server → Client
socket.on('subscribed', {
  success: true,
  subscriptionId: 'sub-xxx',
  topics: ['sensory.hearing.caption_stream.*'],
  timestamp: 1713244800000
})

// 取消订阅
socket.emit('unsubscribe', { subscriptionId: 'sub-xxx' })
socket.on('unsubscribed', { success: true, subscriptionId: 'sub-xxx' })
```

#### `message` — 通用消息收发

```js
// Client → Server（发送消息，Neural Core 自动路由）
socket.emit('message', {
  kind: 'event',
  topic: 'sensory.hearing.caption_stream.segment',
  source: { actorId: 'sensory-hearing', runtime: 'python', system: 'sensory' },
  payload: { text: '你好世界', is_final: false }
})

// Server → Client（接收路由过来的消息）
socket.on('message', (data) => {
  // data 就是完整的 BusMessage
  console.log(data.kind, data.topic, data.payload)
})
```

---

## 典型调用链

### 字幕监听（完整链路）

```
1. Body (Electron) → HTTP POST /neural/trigger
   { kind: 'control', topic: 'sensory.hearing.caption_stream.enable' }
                    ↓
2. Neural Core → 查 Capability Registry → 找到 Python Sensory → WS 定向发送
                    ↓
3. Python Sensory 收到 control → 执行字幕监听
                    ↓
4. Python Sensory → emit('message', { kind: 'event', topic: '...segment', payload: { text } })
                    ↓
5. Neural Core → 查 Subscription → 找到 Body → WS 推送给 Body
                    ↓
6. Body 收到 message → 渲染字幕 UI
```

---

## Electron (Body) 端使用

Body 端已封装好客户端服务，其他模组可直接导入：

```ts
import {
  // 连接管理
  connectNeural,
  disconnectNeural,
  getNeuralState,
  onNeuralStateChange,

  // 订阅
  subscribeNeuralTopics,
  unsubscribeNeural,

  // 消息
  sendNeuralMessage,
  onNeuralMessage,
  offNeuralMessage,

  // HTTP 便捷方法
  neuralTrigger,
  neuralStatus,
  neuralListActors,
  neuralListCapabilities,

  // 类型
  NeuralConnectionState,
} from './services/neural/index'
```

### 示例：订阅字幕流

```ts
// 订阅
subscribeNeuralTopics(['sensory.hearing.caption_stream.*'], ['event'])

// 监听消息
onNeuralMessage('message', (msg) => {
  if (msg.topic.includes('segment')) {
    renderSubtitle(msg.payload.text)
  }
})

// 通过 HTTP 启动
await neuralTrigger({
  kind: 'control',
  topic: 'sensory.hearing.caption_stream.enable',
  payload: { language: 'zh-CN' }
})
```

---

## 设计原则

| 原则 | 说明 |
|------|------|
| 禁止系统直连 | 所有通信必须经过 Neural Core |
| Producer 不知道 Consumer | 发送方只管发，Neural Core 负责路由 |
| Brain 不做路由 | Brain 只决定"做什么"（topic），Neural Core 决定"谁来做" |
| Neural Core 不做业务 | 只负责路由、分发、注册，不关心消息内容 |
| Capability ≠ Subscription | Capability = 谁能执行，Subscription = 谁想接收 |
| HTTP 触发，WS 持续 | 一次性动作用 HTTP，持续数据流用 WS |
