# Backend Curl 测试清单

> 默认地址：`http://localhost:12002`

## 1) 能力发现

```bash
curl -s http://localhost:12002/neural/capabilities/list \
  -H 'Content-Type: application/json' \
  -d '{"topic":"brain.language.models.validate","kind":"query"}'
```

```bash
curl -s http://localhost:12002/neural/capabilities/list \
  -H 'Content-Type: application/json' \
  -d '{"topic":"brain.agent.run","kind":"command"}'
```

```bash
curl -s http://localhost:12002/neural/capabilities/list \
  -H 'Content-Type: application/json' \
  -d '{"topic":"brain.agent.coding.run","kind":"command"}'
```

## 2) 模型配置与默认模型

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"query",
    "topic":"brain.language.models.validate",
    "payload":{"strictEnv":true}
  }'
```

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"query",
    "topic":"brain.language.models.list",
    "payload":{}
  }'
```

默认 profile 测试：

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.cortex.chat.complete",
    "payload":{
      "userText":"只回复：DEFAULT_OK",
      "timeoutMs":60000
    }
  }'
```

指定 profile 测试：

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.cortex.chat.complete",
    "payload":{
      "profileName":"kimi-coding",
      "userText":"请只回复：KIMI链路测试通过",
      "timeoutMs":60000
    }
  }'
```

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.cortex.chat.complete",
    "payload":{
      "profileName":"minimax-coding-plan",
      "userText":"你是什么模型？请只回答你的模型名称。",
      "timeoutMs":600000
    }
  }'
```

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.cortex.chat.complete",
    "payload":{
      "profileName":"zai-glm",
      "userText":"你是什么模型？请只回答你的模型名称。",
      "timeoutMs":600000
    }
  }'
```

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.cortex.chat.complete",
    "payload":{
      "profileName":"openrouter",
      "userText":"你是什么模型？请只回答你的模型名称。",
      "timeoutMs":600000
    }
  }'
```

## 3) Agent 会话测试（brain.agent.run）

### 3.1 创建/继续会话（默认工具）

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.agent.run",
    "payload":{
      "profileName":"zai-glm",
      "userText":"请简述今天要做的三件事。",
      "timeoutMs":600000
    }
  }'
```

### 3.2 会话列表

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"query",
    "topic":"brain.agent.session.list",
    "payload":{"limit":20}
  }'
```

### 3.3 会话详情（替换 sessionId）

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"query",
    "topic":"brain.agent.session.get",
    "payload":{
      "sessionId":"<SESSION_ID>",
      "includeMessages":true
    }
  }'
```

### 3.4 在同一会话继续（替换 sessionId）

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.agent.run",
    "payload":{
      "sessionId":"<SESSION_ID>",
      "continue":true,
      "timeoutMs":600000
    }
  }'
```

## 4) Coding Agent 测试（brain.agent.coding.run）

> 该 topic 会启用 `pi-coding-agent` 的 coding tools（`read/bash/edit/write`）。
> `payload.cwd` 支持绝对路径与相对路径；相对路径基于 backend 进程当前工作目录解析。

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.agent.coding.run",
    "payload":{
      "profileName":"zai-glm",
      "userText":"请读取当前仓库根目录并列出前10个文件名。",
      "cwd":".",
      "timeoutMs":600000
    }
  }'
```

指定子目录（替换 cwd）：

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.agent.coding.run",
    "payload":{
      "profileName":"zai-glm",
      "userText":"请读取 package.json 的 scripts 字段并总结。",
      "cwd":"apps/backend",
      "timeoutMs":600000
    }
  }'
```

## 5) 兼容入口：在 brain.agent.run 中启用 coding tools

```bash
curl -s http://localhost:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{
    "kind":"command",
    "topic":"brain.agent.run",
    "payload":{
      "profileName":"zai-glm",
      "toolPreset":"coding",
      "cwd":"apps/backend",
      "userText":"请读取 src 下文件并给出模块概览。",
      "timeoutMs":600000
    }
  }'
```

`toolPreset` 可选值：
- `default`：只用默认工具（当前时间/模型列表/会话元数据）
- `coding`：默认工具 + coding tools
- `coding_only`：仅 coding tools
