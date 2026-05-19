# Motor Tool Runner — Built-in 工具重构与 pi-coding-agent 接入计划

## 1. 背景与目标
当前 Motor Tool Runner 的配置体系能够动态加载 `shell` 和 `process` 类型的工具，但对于 `builtin` (内置) 类型的工具存在逻辑断层（仅有配置声明，无实际执行体）。同时，`BrainAgentService` 仍通过硬编码的方式（`buildCodingTools`）加载 `pi-coding-agent` 的工具，未能享受 Motor 统一管理、鉴权和跨端调用的红利。

**重构目标**：
1. **彻底解耦**：移除 `BrainAgentService` 对特定工具的硬编码依赖。
2. **闭环 Built-in 机制**：建立内置工具的“提供者 (Provider)”机制，使得 JSON 配置能够与后端代码中的类动态绑定。
3. **统一底座**：将 `pi-coding-agent` (以及系统 session 工具) 抽象为 Motor 的 Built-in 工具，统一由 `ToolRegistry` 管理。

---

## 2. 架构设计：Provider 模式

我们引入 `BuiltinToolProvider` 概念。它是一段存在于 `backend` 代码中的逻辑，负责在 Motor 加载对应的 `builtin` 配置时，返回一个具备真实 `execute` 能力的 `ToolInstance`。

### 核心流转
1. **预注册**：系统启动时，向 Motor 注册一组 Providers (例如 `PiCodingProvider`, `SystemSessionProvider`)。
2. **加载配置**：`ToolConfigService` 读取 `index.json`。
3. **绑定逻辑**：当发现一个工具是 `type: "builtin"` 且 `id: "pi-coding-tools"` 时，自动查找对应的 Provider，由 Provider 实例化 `ToolInstance` 并重写其 `execute` 方法。
4. **统一分发**：所有的工具最终都进入 `ToolRegistry`。`BrainAgent` 直接获取所有可用工具，无需知道底层是 shell 还是 builtin。

---

## 3. 实施步骤

### Phase 1: 建立 Builtin Provider 基础骨架
**目标**：打通代码逻辑与 JSON 配置的映射。

1. **定义接口**：
   在 `core/tool-descriptor.ts` 中新增 `BuiltinToolProvider` 接口。
   ```typescript
   export interface BuiltinToolProvider {
     readonly providerId: string; // 对应 JSON 中的工具 ID
     createInstance(descriptor: ToolDescriptor): ToolInstance;
   }
   ```
2. **服务改造**：
   修改 `motor-tool-runner.service.ts`，增加 Provider 注册机制，并在调用 `loadToolsFromConfig()` 时，将 Providers 传递给 `ToolConfigService` 用于绑定 `execute` 逻辑。

### Phase 2: 包装 pi-coding-agent (PiCodingProvider)
**目标**：将底层的 pi 工具桥接为 Motor 标准接口。

1. **创建 Provider**：
   在 `apps/backend/src/motor/motor-tool-runner/tools/pi-coding-provider.ts` 实现 `BuiltinToolProvider`。
   * **providerId**: `pi-coding-tools`
   * **execute 逻辑**：在执行时，根据 `context.cwd` 动态调用 `createCodingTools(cwd)` 获取工具并执行。
2. **初始化注入**：
   在 `MotorToolRunnerModule` 中，将 `PiCodingProvider` 注册到系统中。
3. **默认配置准备**：
   修改 `tool-config.service.ts` 的 `createSampleTools`，默认生成一个 `pi-coding-tools.json`，声明 `read`, `bash`, `edit` 等 capabilities。

### Phase 3: 包装系统内置工具 (SessionProvider)
**目标**：将获取 Session 信息的工具也纳入 Motor。

1. **创建 Provider**：
   实现 `SystemSessionProvider` (providerId: `system-session-tools`)。
2. **逻辑迁移**：
   将 `BrainAgentService` 中的 `get_session_meta` 逻辑平移至该 Provider 中。

### Phase 4: 清理 BrainAgentService
**目标**：完成控制权交接。

1. **移除硬编码**：
   删除 `BrainAgentService` 中的 `buildTools` 和 `buildCodingTools` 私有方法。
2. **直接调用**：
   Agent 启动时，直接调用 `this.toolAdapterService.getToolsForAgent()` 获取所有被激活的工具。
3. **Preset 逻辑调整**：
   对于 `coding_only` 这种 Preset，改为在获取所有 AgentTool 后，通过过滤工具 ID 来实现，而不是硬编码组装。

---

## 4. 扩展性展望（V2）
在完成上述重构后，系统将具备极强的扩展性：
* **业务侧加工具**：如果开发者需要写带有 Node.js 环境的复杂工具，只需写一个 Provider 并注册，然后在 JSON 里激活即可。
* **Script 工具支持**：未来可以新增 `type: "script"`，在 JSON 中配置 `scriptPath: "./my-logic.js"`，Motor 在运行时动态 `import()`，实现真正的“免编译”热更新逻辑工具。
