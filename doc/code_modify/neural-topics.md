# Neural Topics 修改指南

## 概述

`packages/neural-topics` 是 Neural Core 所有 topic 字符串的 **唯一来源（Single Source of Truth）**。

三端统一引用，消除硬编码：

| 端 | 引入方式 | 文件 |
|----|----------|------|
| Electron (Body) | `import { TOPIC, SUB } from 'neural-topics'` | `packages/neural-topics/src/index.ts` |
| NestJS (Backend) | `import { TOPIC, SUB } from 'neural-topics'` | `packages/neural-topics/src/index.ts` |
| Python | `from module.common.neural_topics import TOPICS, ACTORS` | `packages/neural-topics/python/neural_topics.py` |

## 目录结构

```
packages/neural-topics/
├── package.json              # workspace 包声明（含 postinstall 同步脚本）
├── topics.json               # [唯一来源] topic 注册表
├── src/
│   └── index.ts              # TS 常量导出
├── python/
│   └── neural_topics.py      # Python 常量导出
└── scripts/
    └── sync-python.js        # postinstall 自动同步 Python 文件

apps/python-service/module/common/
└── neural_topics.py          # [自动生成] 由 sync-python.js 同步，勿手动编辑
```

## 添加新的 Namespace

以添加 `sensory.vision.camera_stream` 为例：

### 1. 编辑 `topics.json`

在 `topics.topics` 下新增条目：

```json
{
  "version": "1.0.0",
  "topics": {
    "sensory.hearing.caption_stream": { "...已有内容..." },
    "sensory.vision.camera_stream": {
      "description": "视觉感知 — 摄像头流控制与事件",
      "actor": {
        "actorId": "sensory-vision",
        "runtime": "python",
        "system": "sensory",
        "module": "vision"
      },
      "capabilities": [
        {
          "id": "sensory.vision.camera_stream",
          "topic": "sensory.vision.camera_stream.enable",
          "kinds": ["control"],
          "mode": "stream"
        },
        {
          "id": "sensory.vision.camera_stream.stop",
          "topic": "sensory.vision.camera_stream.disable",
          "kinds": ["control"],
          "mode": "once"
        }
      ],
      "subscribeTopics": ["sensory.vision.camera_stream.*"],
      "subscribeKinds": ["control"],
      "actions": {
        "enable":   { "kind": "control", "direction": "body → python", "description": "启动摄像头流" },
        "disable":  { "kind": "control", "direction": "body → python", "description": "停止摄像头流" },
        "started":  { "kind": "event",   "direction": "python → subscribers", "description": "已启动" },
        "frame":    { "kind": "event",   "direction": "python → subscribers", "description": "帧数据" },
        "stopped":  { "kind": "event",   "direction": "python → subscribers", "description": "已停止" },
        "error":    { "kind": "event",   "direction": "python → subscribers", "description": "错误" }
      }
    }
  }
}
```

### 2. 更新 `src/index.ts`

在对应 section 末尾追加常量：

```ts
// Namespaces
export const NS = {
  SENSORY_HEARING: 'sensory.hearing.caption_stream',
  SENSORY_VISION: 'sensory.vision.camera_stream',        // ← 新增
} as const

// Topics
export const TOPIC = {
  // ... hearing topics ...
  // vision control
  SENSORY_VISION_ENABLE: 'sensory.vision.camera_stream.enable',
  SENSORY_VISION_DISABLE: 'sensory.vision.camera_stream.disable',
  // vision event
  SENSORY_VISION_STARTED: 'sensory.vision.camera_stream.started',
  SENSORY_VISION_FRAME: 'sensory.vision.camera_stream.frame',
  SENSORY_VISION_STOPPED: 'sensory.vision.camera_stream.stopped',
  SENSORY_VISION_ERROR: 'sensory.vision.camera_stream.error',
} as const

// Subscribe patterns
export const SUB = {
  SENSORY_HEARING_ALL: 'sensory.hearing.caption_stream.*',
  SENSORY_VISION_ALL: 'sensory.vision.camera_stream.*',  // ← 新增
} as const

// Actor definitions
export const ACTOR = {
  SENSORY_HEARING: { ... },
  SENSORY_VISION: {                                         // ← 新增
    actorId: 'sensory-vision',
    runtime: 'python' as const,
    system: 'sensory' as const,
    module: 'vision',
  },
} as const

// Capabilities
export const CAP = {
  // ... hearing caps ...
  SENSORY_VISION_STREAM: { ... },   // ← 新增
  SENSORY_VISION_STOP: { ... },     // ← 新增
} as const

// Event type → topic 映射（如果该 namespace 有 event）
export const EVENT_TOPIC: Record<string, string> = {
  // ... hearing events ...
  vision_started: TOPIC.SENSORY_VISION_STARTED,
  vision_frame:   TOPIC.SENSORY_VISION_FRAME,
  vision_stopped: TOPIC.SENSORY_VISION_STOPPED,
  vision_error:   TOPIC.SENSORY_VISION_ERROR,
}
```

### 3. 更新 `python/neural_topics.py`

在对应 section 追加同样的常量：

```python
# Namespaces
NS = {
    "SENSORY_HEARING": "sensory.hearing.caption_stream",
    "SENSORY_VISION": "sensory.vision.camera_stream",
}

# Topics
TOPICS = {
    # ... hearing topics ...
    "SENSORY_VISION_ENABLE": "sensory.vision.camera_stream.enable",
    "SENSORY_VISION_DISABLE": "sensory.vision.camera_stream.disable",
    "SENSORY_VISION_STARTED": "sensory.vision.camera_stream.started",
    "SENSORY_VISION_FRAME": "sensory.vision.camera_stream.frame",
    "SENSORY_VISION_STOPPED": "sensory.vision.camera_stream.stopped",
    "SENSORY_VISION_ERROR": "sensory.vision.camera_stream.error",
}

# ... 其余 section 同理追加 ...
```

### 4. 同步 Python 文件

```bash
node packages/neural-topics/scripts/sync-python.js
```

> 也可执行 `yarn install` 触发 postinstall 自动同步。

### 5. 验证

```bash
# TS 类型检查
cd apps/body && npm run typecheck:node

# NestJS 构建
cd apps/backend && npm run build

# Python 导入验证
cd apps/python-service && uv run python -c "from module.common.neural_topics import TOPICS, ACTORS; print('OK')"
```

## 添加 Query 类型 Capability

Query 类型的 Capability 用于声明 Actor 可以处理查询类消息。与 control 不同，query 走 HTTP 同步调用，不走 WS。

以添加 `sensory.hearing.caption_stream.asr_models` 为例：

### 1. `topics.json` — capabilities 和 actions 中各新增一条

```json
"capabilities": [
  // ... 已有 control capabilities ...
  {
    "id": "sensory.hearing.caption_stream.asr_models",
    "topic": "sensory.hearing.caption_stream.asr_models",
    "kinds": ["query"],
    "mode": "once"
  }
],
"actions": {
  // ... 已有 actions ...
  "asr_models": { "kind": "query", "direction": "body → nest → python (HTTP)", "description": "查询可用 ASR 模型列表" }
}
```

### 2. `src/index.ts` — TOPIC 和 CAP 中新增

```ts
// Topics
export const TOPIC = {
  // ... 已有 topics ...
  // query
  SENSORY_HEARING_ASR_MODELS: 'sensory.hearing.caption_stream.asr_models',
} as const

// Capabilities
export const CAP = {
  // ... 已有 caps ...
  SENSORY_HEARING_ASR_MODELS: {
    id: 'sensory.hearing.caption_stream.asr_models',
    actor: ACTOR.SENSORY_HEARING,
    topic: TOPIC.SENSORY_HEARING_ASR_MODELS,
    kinds: ['query'] as const,
    mode: 'once' as const,
    enabled: true,
    online: true,
  },
} as const
```

### 3. `python/neural_topics.py` — TOPICS 和 CAPABILITIES 中新增

```python
TOPICS = {
    # ... 已有 topics ...
    # query
    "SENSORY_HEARING_ASR_MODELS": "sensory.hearing.caption_stream.asr_models",
}

CAPABILITIES = [
    # ... 已有 capabilities ...
    {
        "id": "sensory.hearing.caption_stream.asr_models",
        "actor": ACTORS["SENSORY_HEARING"],
        "topic": TOPICS["SENSORY_HEARING_ASR_MODELS"],
        "kinds": ["query"],
        "mode": "once",
        "enabled": True,
        "online": True,
    },
]
```

### 4. Python 端实现 query 处理

在 `neural_adapter.py` 的 `handle_query()` 中新增 topic 路由分支：

```python
async def handle_query(self, message: dict) -> dict:
    topic = message.get("topic", "")
    if topic.endswith(".asr_models"):
        return self._query_asr_models()
    # ... 其他 topic ...
```

### 5. 调用方式

```typescript
// Electron 端通过 trigger 统一调用
const result = await neuralTrigger({
  kind: 'query',
  topic: 'sensory.hearing.caption_stream.asr_models',
  payload: {}
})
// result = { success: true, data: { ... } }
```

> **注意**：query 类型的 Capability 不需要出现在 `subscribeTopics` 或 `subscribeKinds` 中，因为它走 HTTP 中转而非 WS 广播。

## 修改已有 Topic

流程与新增一致，只需在 `topics.json` + `src/index.ts` + `python/neural_topics.py` 三处同步修改，然后执行同步脚本。

**注意事项：**
- `apps/python-service/module/common/neural_topics.py` 是自动同步的副本，**勿手动编辑**
- 修改后务必三端验证（TS typecheck + NestJS build + Python import）

## 常量命名规范

| 类型 | 前缀 | 示例 |
|------|------|------|
| Namespace | `NS.*` | `NS.SENSORY_HEARING` |
| Topic | `TOPIC.*` | `TOPIC.SENSORY_HEARING_ENABLE` |
| Subscribe pattern | `SUB.*` | `SUB.SENSORY_HEARING_ALL` |
| Actor | `ACTOR.*` | `ACTOR.SENSORY_HEARING` |
| Capability | `CAP.*` | `CAP.SENSORY_HEARING_STREAM` |

命名格式：`{SYSTEM}_{MODULE}_{ACTION}`，全大写，下划线分隔。
