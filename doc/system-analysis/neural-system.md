# Neural System 系统总结

> 基于 Capability Registry + Subscription 的跨 Runtime 消息路由中枢

## 一、定位

Neural Core 是整个系统的**通信中枢（Message Bus）**，所有子系统间的通信必须经过它。

| 组件 | 职责 |
|------|------|
| Brain | 决定**做什么**（topic / intent） |
| Neural Core | 决定**发给谁**（actor 路由） |
| Actor（Sensory / Motor / Body） | **执行** |

**一句话**：Neural Core = 统一消息入口 + 路由中心 + 订阅中心 + 协议层

---

## 二、架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                        Neural Core (Nest)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐│
│  │ NeuralCore   │  │ NeuralWs     │  │ NeuralHttp           ││
│  │ Service      │  │ Gateway      │  │ Controller           ││
│  │              │  │              │  │                      ││
│  │ · Actor 管理  │  │ · 连接管理    │  │ · POST /neural/trigger      ││
│  │ · Capability │  │ · register   │  │ · POST /neural/actors/list   ││
│  │   Registry   │  │ · heartbeat  │  │ · POST /neural/capabilities/list││
│  │ · Subscription│  │ · subscribe  │  │ · POST /neural/subscriptions/list││
│  │ · Routing    │  │ · message    │  │ · POST /neural/admin/*       ││
│  └──────────────┘  └──────────────┘  │ · POST /neural/debug/*       ││
│                                        └──────────────────────┘│
└─────────────┬──────────────┬──────────────────────────────────┘
              │ WS           │ HTTP
     ┌────────┴───┐   ┌─────┴──────┐
     │            │   │            │
┌────▼────┐ ┌────▼────┐ │  ┌────────▼────────┐
│ Electron│ │ Python  │ │  │ 任何 HTTP 客户端  │
│ (Body)  │ │(Sensory)│ │  │ (调试/管理)      │
└─────────┘ └─────────┘ │  └─────────────────┘
                        │
              ┌─────────┴──────────┐
              │ NeuralHttpService  │
              │ (Electron 端)      │
              └────────────────────┘
```

### 三端客户端

| 端 | 文件 | 通信方式 | 角色 |
|----|------|----------|------|
| **Nest (后端)** | `apps/backend/src/neural/` | 内部调用 | Neural Core 本体 |
| **Electron (Body)** | `apps/body/src/main/services/neural/` | WS + HTTP | 触发控制 + 接收事件 |
| **Python (Sensory)** | `apps/python-service/module/` | WS + HTTP | 执行能力 + 发送事件 |

---

## 三、核心模型

### 3.1 BusMessage — 统一消息结构

```typescript
interface BusMessage<T = any> {
  id: string
  kind: MessageKind
  topic: string
  source: ActorRef
  target?: ActorRef
  timestamp: number
  correlationId?: string
  causationId?: string
  payload: T
}
```

### 3.2 MessageKind — 消息语义

| Kind | 语义 | 路由策略 |
|------|------|----------|
| `command` | 执行一次动作 | 定向（Capability） |
| `query` | 查询并返回数据 | 定向（Capability），python runtime 走 HTTP 中转 |
| `control` | 控制能力状态（启动/停止） | 定向（Capability） |
| `event` | 事实广播 | 广播（Subscription） |
| `response` | 成功返回 | 回源（target/correlationId） |
| `error` | 失败 | 回源（target/correlationId） |

### 3.3 ActorRef — Actor 身份

```typescript
interface ActorRef {
  actorId: string
  runtime: 'electron' | 'nest' | 'python'
  system: 'sensory' | 'neural' | 'brain' | 'motor' | 'body'
  module?: string
}
```

### 3.4 Capability — 能力注册

```typescript
interface Capability {
  id: string
  actor: ActorRef
  topic: string          // 能处理的 topic
  kinds?: MessageKind[]  // 能处理的 kind
  mode: 'once' | 'stream'
  enabled: boolean
  online: boolean
  priority?: number
}
```

> Capability 回答：**"谁能做什么"**

### 3.5 Subscription — 事件订阅

```typescript
interface Subscription {
  id: string
  subscriber: ActorRef
  topics: string[]       // 订阅的 topic pattern
  kinds?: MessageKind[]  // 过滤的 kind
}
```

> Subscription 回答：**"谁想接收什么"**

### 3.6 ActorState — Actor 运行时状态

```typescript
interface ActorState {
  actor: ActorRef
  connected: boolean
  lastHeartbeatAt?: number
  connectionId?: string
}
```

---

## 四、路由机制（核心）

### 4.1 路由总入口

```
route(message: BusMessage) → RouteResult { targets, subscribers }
```

### 4.2 三种路由策略

```
                    ┌─ command/control
                    │   → routeDirected()
                    │     查 Capability Registry
                    │     精确匹配优先，WS 定向发送
                    │
BusMessage ─→ route ─┼─ query
                    │   → routeDirected()
                    │     查 Capability Registry
                    │     若 target.runtime === 'python' → HTTP 中转到 /neural/query
                    │     否则 WS 定向发送
                    │
                    ├─ event
                    │   → routeBroadcast()
                    │     查 Subscription
                    │     按 connectionId 去重，广播
                    │
                    └─ response/error
                        → routeReply()
                          根据 target/correlationId 回源
```

> **query 的 HTTP 中转**：对于 `kind: 'query'` 且目标 actor 的 `runtime === 'python'`，Nest 的 `trigger()` 会跳过 WS 发送，直接 HTTP 调用 Python 的 `/neural/query` 端点，利用 HTTP 的请求-响应特性同步拿到结果，避免在 WS 链路上做 correlationId 追踪。

### 4.3 Topic 匹配规则

| 规则 | 示例 | 匹配 |
|------|------|------|
| 精确匹配 | `sensory.hearing.caption_stream.enable` | 精确相等 |
| 后缀通配符 | `sensory.hearing.caption_stream.*` | 匹配所有子 topic |
| 多级通配符 | `sensory.hearing.**` | 递归匹配所有层级 |

### 4.4 定向路由选路优先级

1. `target` 存在 → 直接发送，不走 Registry
2. 精确 topic 匹配优先
3. 必须满足 `online=true`
4. 多个候选 → 取第一个（按注册顺序）

---

## 五、通信协议

### 5.1 WebSocket 协议（持久连接）

| 方向 | 事件 | 用途 |
|------|------|------|
| Client → Server | `register` | 注册 Actor 身份 |
| Client → Server | `register_capabilities` | 注册能力列表 |
| Client → Server | `heartbeat` | 心跳保活 |
| Client → Server | `subscribe` | 订阅 topic |
| Client → Server | `unsubscribe` | 取消订阅 |
| Client → Server | `message` | 发送总线消息 |
| Server → Client | `registered` | 注册确认 |
| Server → Client | `subscribed` | 订阅确认 |
| Server → Client | `message` | 接收路由后的消息 |

### 5.2 HTTP 接口（触发/查询/管理）

**Nest 端 (Neural Core)**

| 端点 | 用途 |
|------|------|
| `POST /neural/trigger` | 触发消息（构造 BusMessage 后路由；query 类型自动 HTTP 中转） |
| `POST /neural/actors/list` | 列出所有 Actor |
| `POST /neural/capabilities/list` | 查询能力注册 |
| `POST /neural/subscriptions/list` | 查询订阅 |
| `POST /neural/admin/cleanup` | 清理失活 Actor |
| `POST /neural/admin/disconnect` | 强制断开 Actor |
| `POST /neural/debug/publish` | 调试发布消息 |
| `POST /neural/debug/status` | 调试状态 |

**Python 端 (Sensory Service)**

| 端点 | 用途 |
|------|------|
| `POST /neural/query` | 统一 query 入口（接收 `{topic, payload}`，返回业务数据） |

### 5.3 通信分层原则

| 通道 | 用途 |
|------|------|
| HTTP | 触发 / 查询 / 管理（一次性） |
| WebSocket | 注册 / 订阅 / 事件流（持久） |

---

## 六、客户端接入

### 6.1 接入流程

```
WS 连接建立
  → register(actor)            注册身份
  → register_capabilities()    注册能力（生产者）
  → subscribe(topics, kinds)   订阅事件（消费者）
  → heartbeat()                心跳保活
  → message/send_event()       收发消息
```

### 6.2 Electron 端 (Body)

**文件**：`apps/body/src/main/services/neural/`

| 模块 | 功能 |
|------|------|
| `impl/neural-ws-client.ts` | WS 客户端（连接、注册、订阅、消息收发） |
| `impl/neural-http.ts` | HTTP 客户端（trigger、status、list 查询） |
| `index.ts` | 公共 API 封装 |

**公共 API**：
- `connectNeural()` / `disconnectNeural()` — 连接管理
- `subscribeNeuralTopics(topics, kinds)` — 订阅
- `onNeuralMessage(event, handler)` — 监听消息
- `neuralTrigger(params)` — HTTP 触发消息

**消息分发机制**：
```
socket.on('message', data)
  → dispatchMessage('message', data)
  → messageHandlers Map 遍历执行
```

业务 handler 只注册到 `messageHandlers`，不直接绑定 socket，避免重复调用。

### 6.3 Python 端 (Sensory)

**文件**：`apps/python-service/module/sensory/sensory_hearing/`

| 模块 | 功能 |
|------|------|
| `neural_client.py` | WS 客户端（连接、注册、心跳、消息收发） |
| `neural_adapter.py` | 业务适配层（桥接 Neural 消息 ↔ VadRecordingSession；query 路由分发） |
| `query_router.py` | HTTP query 入口（`/neural/query`，转发给 adapter） |

**Topic 定义**：`apps/python-service/module/common/neural_topics.py`

| 常量 | 说明 |
|------|------|
| `TOPICS` | 所有 topic 定义（enable / disable / started / segment 等） |
| `SUB` | 订阅模式（`sensory.hearing.caption_stream.*`） |
| `ACTORS` | Actor 定义 |
| `CAPABILITIES` | 能力注册列表 |
| `EVENT_TOPIC_MAP` | 事件类型 → topic 映射 |

**连接自动注册链**：
```
connect()
  → register(actor)
  → register_capabilities()     # 注册能处理的 control topic
  → subscribe_topics()           # 订阅感兴趣的事件（kinds=["control"]）
  → start_heartbeat()            # 心跳保活
```

---

## 七、典型调用链 — 字幕监听

```
Body (Electron)
  │
  │  ① HTTP: POST /neural/trigger
  │     { kind: "control", topic: "sensory.hearing.caption_stream.enable" }
  │
  ▼
Neural Core (Nest)
  │
  │  ② routeDirected() → 查 Capability Registry
  │     匹配到 sensory-hearing actor → WS 定向发送
  │
  ▼
Sensory (Python)
  │
  │  ③ 收到 control → NeuralAdapter._handle_enable()
  │     VadRecordingSession.prepare() + start()
  │
  │  ④ 发送事件:
  │     send_event("sensory.hearing.caption_stream.started", {type: "started"})
  │     send_event("sensory.hearing.caption_stream.segment",  {type: "segment_ready", ...})
  │     send_event("sensory.hearing.caption_stream.vad_start", {type: "vad_start", ...})
  │
  ▼
Neural Core (Nest)
  │
  │  ⑤ routeBroadcast() → 查 Subscription (kind=event)
  │     匹配到 Body 的订阅 → broadcast
  │
  ▼
Body (Electron)
  │
  │  ⑥ handleHearingEvent(data)
  │     BrowserWindow.getAllWindows() → webContents.send('sense:hearing-event')
  │
  ▼
Renderer (Vue)
  显示字幕
```

---

## 八、典型调用链 — Query 查询（ASR 模型列表）

```
Body (Electron)
  │
  │  ① HTTP: POST /neural/trigger
  │     { kind: "query", topic: "sensory.hearing.caption_stream.asr_models" }
  │
  ▼
Neural Core (Nest)
  │
  │  ② trigger() → kind === 'query'
  │     findCapabilities() → 匹配到 sensory-hearing (runtime: python)
  │     → queryViaHttp(): HTTP POST /neural/query
  │
  ▼
Sensory (Python)
  │
  │  ③ query_router → adapter.handle_query()
  │     topic 匹配 .asr_models → _query_asr_models()
  │     → ASRServiceFactory.get_transcribers_info()
  │
  │  ④ HTTP 200 { success: true, data: { ... } }
  │
  ▼
Neural Core (Nest)
  │
  │  ⑤ 返回 { success: true, data: { ... } }
  │
  ▼
Body (Electron)
  │
  │  ⑥ 拿到 ASR 模型列表
```

**与 control 链路的区别**：
- control/command → 通过 WS 发送到 Python，Python 异步执行，不返回结果
- query → Nest 通过 HTTP 中转，同步调用 Python 的 `/neural/query`，直接拿到响应数据返回给调用方

---

## 九、Actor 生命周期

```
           ┌──────────┐
           │ 连接建立  │
           └────┬─────┘
                │
           ┌────▼─────┐
      ┌────│ register │──── 自动注册 Actor
      │    └────┬─────┘
      │         │
      │    ┌────▼──────────────┐
      │    │register_capabilities│── 注册能力（可选）
      │    └────┬──────────────┘
      │         │
      │    ┌────▼─────┐
      │    │subscribe  │── 订阅事件（可选）
      │    └────┬─────┘
      │         │
      │    ┌────▼─────┐
      │    │ 正常通信   │── 收发消息
      │    │ heartbeat │── 心跳保活
      │    └────┬─────┘
      │         │
      │    ┌────▼─────┐
      │    │ 断开连接   │
      │    └────┬─────┘
      │         │
      └─────────┘
```

**断开时自动清理**：
- Actor 状态标记为 `connected=false`
- Capability 标记为 `online=false`
- 订阅保留（Actor 重新连接后可恢复）

---

## 十、设计原则

### 1. 不允许系统直连

> 所有系统通信必须经过 Neural Core

### 2. Producer 不知道 Consumer

> Sensory 只 publish，Neural Core 负责路由分发

### 3. Capability ≠ Subscription

| 类型 | 作用 | 方向 |
|------|------|------|
| Capability | 谁能**执行** | Actor → Neural Core（注册） |
| Subscription | 谁想**接收** | Actor → Neural Core（订阅） |

### 4. request / action / event 分离

```
enable_requested (command)  → Brain 决策
enable          (control)   → Sensory 执行
started         (event)     → 广播事实
```

### 5. 命令走接口，事件走总线

- 高价值事件进入总线（字幕、VAD 状态、录音状态）
- 高频数据本地处理

---

## 十一、已实现功能清单

### Nest 后端

- [x] BusMessage 统一消息模型
- [x] Actor 注册 / 注销 / 心跳
- [x] Capability Registry（注册 / 查询 / 精确+通配符匹配）
- [x] Subscription 管理（注册 / 取消 / 查询）
- [x] 路由引擎（定向 / 广播 / 回源）
- [x] 广播按 connectionId 去重
- [x] WebSocket Gateway（register / heartbeat / subscribe / message）
- [x] HTTP Controller（trigger / list / admin / debug）
- [x] Query HTTP 中转（trigger 中 kind=query + runtime=python → HTTP 调用 Python /neural/query）
- [x] 失活 Actor 自动清理

### Electron 客户端

- [x] WebSocket 连接管理（自动重连、状态机）
- [x] Actor 注册
- [x] Topic 订阅 / 取消订阅
- [x] 消息监听（on/off）
- [x] HTTP trigger 触发
- [x] 统一分发机制（dispatchMessage，防止重复调用）

### Python 客户端

- [x] WebSocket 连接（socket.io）
- [x] 自动注册链（actor → capabilities → subscribe → heartbeat）
- [x] 事件发送（send_event）
- [x] 控制消息接收（handle_command）
- [x] Query 消息处理（handle_query，根据 topic 路由到具体处理函数）
- [x] Query HTTP 入口（/neural/query，FastAPI 路由）
- [x] NeuralAdapter 适配层（桥接业务逻辑）
- [x] 会话安全重启（graceful_stop 防止并行监听）

### 业务模块

- [x] Hearing（听觉）：VAD 录音 + ASR 字幕流

---

## 十二、Topic 命名规范

```
<system>.<module>.<entity>.<verb>
```

示例：

```
sensory.hearing.caption_stream.enable           # 控制：启动
sensory.hearing.caption_stream.disable          # 控制：停止
sensory.hearing.caption_stream.asr_models       # 查询：ASR 模型列表
sensory.hearing.caption_stream.started          # 事件：已启动
sensory.hearing.caption_stream.segment          # 事件：字幕片段
sensory.hearing.caption_stream.vad_start        # 事件：VAD 检测到语音
sensory.hearing.caption_stream.vad_end          # 事件：VAD 语音结束
sensory.hearing.caption_stream.stopped          # 事件：已停止
sensory.hearing.caption_stream.error            # 事件：错误
```

---

## 十三、文件索引

### Nest 后端

```
apps/backend/src/neural/
├── neural-core/
│   └── neural-core.service.ts        # 核心服务（Registry + Routing）
├── neural-ws/
│   └── neural-ws.gateway.ts          # WebSocket Gateway
├── neural-http/
│   ├── neural-http.controller.ts     # HTTP Controller
│   └── neural-http.service.ts        # HTTP 业务逻辑
└── interfaces/
    └── index.ts                      # 类型定义
```

### Electron 端

```
apps/body/src/main/services/neural/
├── impl/
│   ├── neural-ws-client.ts           # WebSocket 客户端
│   └── neural-http.ts                # HTTP 客户端
└── index.ts                          # 公共 API
```

### Python 端

```
apps/python-service/module/
├── common/
│   └── neural_topics.py              # Topic / Actor / Capability 定义
└── sensory/sensory_hearing/
    ├── neural_client.py              # WebSocket 客户端
    ├── neural_adapter.py             # 业务适配层（command + query 分发）
    └── query_router.py               # HTTP query 入口（/neural/query）
```
