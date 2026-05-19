# Motor Tool Runner — Built-in 工具重构与 pi-coding-agent 接入计划 (已完成)

## 1. 背景与目标
当前 Motor Tool Runner 建立了内置工具的“提供者 (Provider)”机制，使得 JSON 配置能够与后端代码中的类动态绑定，彻底移除了 `BrainAgentService` 对特定工具的硬编码依赖。

**核心收益**：
- **统一管理**：所有工具（Built-in, Shell, Process）均由 `ToolRegistry` 统一管理。
- **跨端闭环**：Coding 能力不再局限于 Agent，可通过 Neural Core Topic 直接调用。
- **配置化**：通过 `index.json` 即可动态开关系统核心能力。

---

## 2. 架构实现：Provider 模式

### 2.1 核心接口
- **位置**: `apps/backend/src/motor/motor-tool-runner/core/tool-descriptor.ts`
- **定义**: `BuiltinToolProvider` 接口负责根据工具 ID 创建具备逻辑的 `ToolInstance`。

### 2.2 实现类
1. **PiCodingProvider**:
   - **路径**: `apps/backend/src/motor/motor-tool-runner/providers/pi-coding-provider.ts`
   - **功能**: 桥接 `pi-coding-agent`，提供 `read`, `bash`, `edit`, `ls` 等能力。
2. **SystemSessionProvider**:
   - **路径**: `apps/backend/src/motor/motor-tool-runner/providers/system-session-provider.ts`
   - **功能**: 提供 `get_session_meta` 能力，管理 Agent 会话元数据。

---

## 3. 关键代码变更记录

### 3.1 基础设施改造
- **ToolConfigService**: 改造 `reload()` 方法，支持传入 Providers 列表。在加载 `type: "builtin"` 工具时，自动进行 Provider 匹配。
- **MotorToolRunnerService**: 维护 `builtinProviders` 注册表，并在初始化时注入到配置加载流程中。

### 3.2 业务层解耦
- **BrainAgentService**:
  - 移除了 `buildCodingTools` 和 `buildTools` 逻辑。
  - 改为通过 `ToolAdapterService.getAllTools(hooks)` 获取所有工具。
  - 使用 `hooks.beforeToolCall` 动态注入 `cwd` (当前工作目录) 到工具执行上下文中。

---

## 4. 使用与调用方法

### 4.1 自动生成配置
系统启动时会自动在 `~/.ai_secretary/tools/` 生成以下配置文件：
- `pi-coding-tools.json` (默认开启)
- `system-session-tools.json` (默认开启)

### 4.2 Topic 调用示例 (外部/前端调用)
可以使用 `motor.tool.execute` 触发这些内置能力：

```bash
# 调用 read 读取文件内容
curl -X POST http://localhost:3000/neural/trigger \
  -d '{
    "kind": "command",
    "topic": "motor.tool.execute",
    "payload": {
      "tool": "pi-coding-tools",
      "capability": "read",
      "parameters": { "path": "package.json" }
    }
  }'
```

### 4.3 Agent 内部调用
`BrainAgent` 会自动识别并加载这些工具，无需额外操作。

---

## 5. 扩展指南：如何新增内置工具
1. **编写 Provider**: 在 `providers/` 目录下创建实现 `BuiltinToolProvider` 的类。
2. **注册 Provider**: 在 `MotorToolRunnerModule` 中声明并注入到 `MotorToolRunnerService`。
3. **添加配置**: 在 `~/.ai_secretary/tools/tools/` 下添加对应的 JSON 声明，并在 `index.json` 中激活。

---
**当前状态**: ✅ 已在 V1 版本中全量实现。
