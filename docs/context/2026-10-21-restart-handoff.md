# 秘书系统续接记录 · 2026-10-21

用户准备重启电脑，本文件记录会话事实与讨论边界。恢复时先阅读本文件，再按任务读取相关源码；不要把建议当作已经实现或已经授权的修改。

## 当前状态

工程：`/Users/zhou/Desktop/human`，分支 `master-pi`。本次功能提交 `125f528` 已推送 origin；之前 TTS 插件文档提交 `59d72b3`、Live2D TTS 测试补丁提交 `998644f` 也已推送。

用户要求关闭测试服务，已经完成：Electron 主进程 72415 及辅助进程退出，12001 不再监听；后端 42865（及父进程 42863）退出，12002 不再监听；19222 调试端口早已关闭。不要自动重新打开服务；恢复测试时按需启动。

工作树残留 `.beads/backup/*`、`export-state.json`、`interactions.jsonl` 等已有/自动生成记录，保留，未清理。不要据此重置工作树。

## 实现事实

### TTS 第一个外部插件

代码位于 `/Users/zhou/Desktop/human-tools/tts/qwen3-mlx`，插件包 `human-tts-qwen3-mlx`，工具 ID `qwen3-mlx`。通过 `~/.ai_secretary/plugins/node_modules` 安装/链接，通过 `~/.ai_secretary/tools/` 配置加载。宿主通过 tts@1.0 类别契约发现并调用，不硬编码引擎。

Node 插件管理常驻 Python JSONL worker，使用本地 MLX/Qwen3-TTS；有预设与参考音频克隆，支持 WAV/MP3、缓存与清理。具体命令看该目录 README.md、PLUGIN.md；宿主说明在 `doc/plugins/qwen3-mlx.md`。音频通过 `/tts-cache/:pluginId/:file` 提供，Body 播放及口型复用现有链路。

### 桌面 Agent 测试入口

Live2D 有独立「Agent 测试」按钮，打开 `/agent-panel`。原聊天窗口 `/chat-panel` 没有替换，仍走 `brain.cortex.ask.requested`。

测试面板走 `brain.agent.run`，支持任务提交、可选模型 profile、流式回答/思考、工具执行参数与结果、新建会话和恢复最近会话。默认 `toolPreset: none`；后端已经增加 none 模式，不构建任何工具。用户可显式开启全部工具或 coding_only。不是安全沙箱；没有停止任务、可靠后台运行状态查询或崩溃后恢复。

每轮主进程创建独立 Neural Socket.IO 观察者，等待注册/订阅确认后再 HTTP 提交，只向该窗口转发匹配会话和运行 ID 的事件，结束后清理。不干扰 hearing 原有订阅。

Body 新文件重点：

- `apps/body/src/main/services/agent/index.ts`：独立窗口、事件连接与 IPC 服务。
- `apps/body/src/main/services/agent/bridge.ts`：订阅先于执行、过滤及清理。
- `apps/body/src/shared/agent-panel.ts`：请求校验、响应检查、Pi 事件转展示状态。
- `apps/body/src/renderer/src/pages/agent-panel/index.vue`：Agent 测试界面。

Backend 入口：`apps/backend/src/brain/agent/brain-agent.service.ts`。

验证已通过：Body Agent 6 项测试、TTS 4 项回归、Body 两套类型检查和构建、Backend 类型检查和构建。`verify:agent-panel` 用真实安装的 Pi Agent 加确定性模型流/内存工具验证 model→tool→model、事件与保存；另测 none 模式零工具调用。真实 Electron 对默认 zai-glm 做两轮无工具对话，记住并回答「蓝鲸七号」，验证历史恢复、忙碌锁定和无效 profile 错误恢复。测试会话 `b0cfeec7-eed2-4063-8bc5-06920d37229d`。临时截图位于 `/private/tmp/human-agent-panel.png`，重启后不保证保留。

### 特别重要：Body Git 元数据缺失

父仓库 `apps/body` 是 gitlink（160000），指向 `e169dfb8c73424e94eb829a41fd82de8d93f4345`，但本机没有 Body `.git`，父仓库没有 `.gitmodules`，也没有对应提交对象。普通父仓库提交不会记录 Body 源码改动。

已在本机应用并将差异提交为：

- `patches/body-live2d-tts-test.patch`：先前的 TTS 测试功能。
- `patches/body-agent-test-panel.patch`：基于已应用 TTS 的 Body 增量，共 10 文件。

说明在 `patches/README.md`。不要重复应用；用 `git apply --reverse --check patches/body-agent-test-panel.patch` 检查已应用状态。未获授权不得把整个 Body 转普通目录或重建未知远端。`human-ryp` 跟踪此问题。

## 当前 Pi 使用方式

本机 `@earendil-works/pi-ai`、`pi-agent-core`、`pi-coding-agent` 都是 1.2.0。

`LlmService` 使用 pi-ai 的模型注册表与 complete/stream/streamSimple；`BrainAgentService` 每次加载历史后创建 `new Agent`，注入模型、工具与 streamFn，转发事件，结束后保存。Agent 路径实际走 streamSimple，修改普通 stream/complete 不必然影响 Agent。

Motor 工具由 `ToolAdapterService` / `AgentToolAdapter` 转成 `{name,description,parameters,execute}`，直接提供给 Pi；没有通过 Chord 生成。Pi 编码工具由 `PiCodingProvider.createCodingTools` 包装到 Motor，不是运行完整 CLI。

当前尚未接入 Chord 或 Pi Durable。用户对两者感兴趣，倾向优先评估 Durable。Durable 上游仍标实验性，不能把持久化会话等同于副作用 exactly-once 或崩溃恢复。Chord 是通用对象/契约/状态/跨进程运行时，不等于 Pi 原有扩展系统；与 Neural 和宿主契约有职责交叉，未批准整体迁移。

会话上下文讨论：提出统一 Context Builder，结合原始日志、任务状态、摘要、近期消息及检索记忆。当前 Cortex ask 从当前问题构造上下文再附加记忆，不等于 Agent 历史会话；数据库保存不等于每轮模型都收到全部历史。此架构仅讨论，未实施。

## 最新讨论：外部编码 Agent 委派

用户指定讨论稿：

`/Users/zhou/Desktop/obsidian/work/工程/规划中/秘书自动化/motor-system/Agent 委派：用 Motor tools 调用外部编码代理（讨论稿）.md`

目标支持 Claude Code、Codex、DSH（DeepSeek Harness）、OpenCode、ZCode。已阅读全文并评审，未修改文档或实现插件。原则是 Brain/Pi 负责编排、上下文与验收，外部专业代理经 Motor 执行，不自行重造完整编码产品。不是断言 Pi 永远不如其他 Agent。

本机 PATH 找到 claude/codex/dsh/opencode（均经 Volta 路径）；`/Applications/ZCode.app` 存在，PATH 无 zcode。没有本轮登录、安装或执行外部编码任务。

官方文档核对后对讨论稿提出的修正（均为建议，不是已定最终协议）：

- CLI/SDK/server/cmux 是执行通道，同步/异步是任务生命周期。无头 CLI 也可后台长运行，不要规定长任务必须 cmux。通知/Stop hook/读屏仅辅助，不是可靠成功证明。
- DSH 上游已有 `dsh --profile headless`、`--json`、`--session-id`；ZCode 官方仓库已有 CLI 和非交互能力。具体本机版本仍待核对，不能因 PATH 缺命令就认定不支持。
- Codex 官方 `exec` 默认只读，需要编辑时显式 workspace-write；不要默认绕过权限。Claude 无头模式可能加载仓库 hooks/MCP，不加危险参数不等于充分隔离。
- 共用运行管理和小型统一契约，各代理分别做启动、权限、事件、会话和取消适配。模型不可任意指定 executable/shell/CLI flags。
- 建议用 run 而不是含糊的 ask，包含任务与验收条件、工作区、权限策略、预算；输出区分 runId、原生会话 ID、状态、摘要与完整日志/产物引用。
- 优先流式解析结构化输出，不能截断 JSON 后降级原文仍当成功。超时不代表撤销或子进程全部退出，不得自动换代理重跑有副作用任务。
- cwd 不是沙箱；环境变量最小化、权限不能放大、独立会话映射。同一目录默认串行写；并行可用 worktree，但 worktree 也不是安全隔离。
- 执行结束不等于验收通过，检查 diff/测试/产物。建议新增委派专用 toolPreset；当前 coding_only 按前缀筛选，新插件不会自然进入。
- 建议先 Codex+Claude 的安全闭环，再 OpenCode+DSH，再定位 ZCode。成本/次数/嵌套委派深度要受限。

官方参考：

- https://learn.chatgpt.com/docs/non-interactive-mode
- https://code.claude.com/docs/en/headless
- https://opencode.ai/docs/cli/
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md
- https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/README.md

## Beads 续接索引

`human-sl2` 为桌面 Agent 测试功能，已关闭；`human-152` 为取消、并发与中断后查询，待处理；`human-ryp` 为 Body Git 元数据，待处理；`human-ogp` 为外部 Agent 委派讨论任务；`human-op5` 是更广的 TTS 主线任务。

当前 bd 版本没有 `bd sync`，旧 AGENTS 指令已过时；Git 提交钩子会导出 `.beads/issues.jsonl`。bd 连接本机 Dolt 127.0.0.1:64290，在沙箱中可能误报 non-dolt 占用端口，先请求正常权限连接，不要杀数据库或擅自改端口。

## 恢复时的阅读入口

先读本文件和 `patches/README.md`。若继续外部代理委派，读上述讨论稿及 `ToolAdapterService`、`AgentToolAdapter`、`ToolExecutor`，对照各 CLI 当前本机版本验证。若继续桌面测试，读 `docs/plans/2026-10-21-agent-test-panel.md`；临时目录不是源码权威来源。
