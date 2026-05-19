# Motor System (Tool Runner) 系统总结

## 一、 系统定位与目标
Motor Tool Runner 是系统对外执行能力的“手部”，负责管理所有外部工具、进程及服务的生命周期与执行逻辑。
- **工具化设计**：支持通过 JSON 配置文件动态声明新工具，无需修改核心代码。
- **统一生命周期**：管理工具的 `start` (启动), `stop` (关闭), `healthCheck` (健康检测) 等状态。
- **跨端执行**：支持 App (Neural Core) 和 Agent (pi-agent-core) 两套系统共用同一套工具实例。

## 二、 架构归属与代码位置
系统主要逻辑分布在 `apps/backend/src/motor/motor-tool-runner` 及其配置服务中。

### 核心代码位置：
- **主服务**: `apps/backend/src/motor/motor-tool-runner/motor-tool-runner.service.ts` (初始化与重载逻辑)
- **工具注册表**: `core/tool-registry.ts` (管理工具实例的生命周期与健康检测)
- **执行引擎**: `core/tool-executor.ts` (负责工具具体执行，发送 started/completed/failed 事件)
- **配置服务**: `apps/backend/src/brain/tool-config/tool-config.service.ts` (负责 JSON 配置的加载、转换与索引)
- **Neural 网关**: `neural/motor-gateway.ts` & `tool-handler.ts` (处理 Neural Core 的工具执行命令)

## 三、 工具配置体系
工具配置存储在用户主目录下的 `~/.ai_secretary/tools/`：
- **index.json**: 工具索引文件，决定哪些工具被启用。
- **tools/*.json**: 每个工具独立的详细配置文件，定义生命周期、能力与接口。

### 工具类型支持：
- **builtin**: 内置工具，直接在代码中实现。
- **process**: 进程工具，由 Motor 负责启动、保活和通过接口（HTTP/stdin）通信。
- **service**: 外部服务，仅需定义接口地址与健康检测。
- **shell**: 脚本工具，通过 Shell 命令直接执行。

## 四、 Topic 信息 (Neural Core)
Motor 通过 Neural Core 暴露以下控制与查询接口：

| Topic | 功能描述 | 消息类型 |
|-------|---------|---------|
| `motor.tool.execute` | **执行工具能力** (核心接口) | command |
| `motor.tool.list` | 查询所有已加载的工具列表 | query |
| `motor.tool.status` | 查询指定工具的运行状态（idle/running/error） | query |
| `motor.tool.reload` | 重新扫描配置文件并加载工具 | command |
| `motor.tool.start/stop/restart` | 手动控制工具进程的生命周期 | command |

## 五、 与 Agent (LLM) 的集成
Motor Tool Runner 通过 `ToolAdapterService` 将 Motor 工具自动桥接为 `pi-agent-core` 的 `AgentTool`：
1. **自动转换**：将 Motor 的 `capabilities` 描述符转换为 LLM 可理解的 JSON Schema。
2. **统一执行**：Agent 调用工具时，底层仍通过 `ToolExecutor` 执行，保证日志、权限与状态的一致性。
3. **参数增强**：支持在对话 Payload 中传递 `useMemory` 等参数，实现记忆系统对工具执行的上下文支持。

## 六、 开发与扩展建议
- **新增工具**：在 `~/.ai_secretary/tools/tools/` 下添加 JSON，并更新 `index.json`，随后发送 `motor.tool.reload` 即可生效。
- **健康检测**：对于长期运行的 `process`，建议配置 `healthCheck` (HTTP 或 pgrep 命令) 以便系统自动拉起失败的进程。
