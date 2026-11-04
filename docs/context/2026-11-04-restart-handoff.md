# 重启续接记录 · 2026-11-04

本文件保存本轮会话事实，不是新的任务状态表。需求状态与依赖以 Beads 为准；恢复后先核实工作树，不能把上次审查结论当作当前源码仍未修复的证明。

## 当前请求与授权边界

用户要求审查「工具决策路由」（human-6n4）首期实现，随后要求重启前记录上下文。本轮只做代码审查和定向复现，未修改功能代码，未获得修复授权。下一轮若用户仅说“继续”，先明确是复查最新修复还是开始修复，不擅自扩大范围。

工程 `/Users/zhou/Desktop/human`。记录时 HEAD 为 `7930d6b`。工程存在用户/其他会话的未提交代码，禁止重置、清理或把它们混入交接文档提交。

## 需求与阅读入口

- 工具决策路由：human-6n4。
- 仓库实施稿：`docs/plans/2026-10-30-工具决策路由.md`。
- Obsidian 功能目录：`/Users/zhou/Desktop/obsidian/work/工程/规划中/秘书自动化/功能/进行/P2-工具决策路由-261026/`。
- 外部模型插件：`/Users/zhou/Desktop/human-tools/router/qwen3-jev-mlx/`。
- 启动先读 `AGENTS.md`、`CLAUDE.md`，再按需读 Obsidian `名词字典.md` 与功能索引。不要把 2026-10-21 的旧交接状态当作当前状态。

实现结构：`packages/contracts/src/contracts/router.ts` 定义 router@1.0；`apps/backend/src/brain/basal-ganglia/` 包含路由服务、SQLite 日志存储、tool_search 元工具；BrainAgentService 接入 off/shadow/active 模式，默认 shadow。外部 Node 插件管理 Python JSON-lines 常驻 Worker，使用本地 MLX/Qwen3-1.7B-4bit。

## 上轮已反馈的四项发现

以下为上轮审查基线的结论。记录交接时工作树已有新增 Motor 改动，可能正在修复，必须重新检查。

1. **P1，Nest 依赖注入导致启动失败。** `tool-routing-log.store.ts:71` 的 `constructor(customDbPath?: string)` 会生成 String 依赖，BrainModule 直接注册该类却没有 String provider。用仅注册该 provider 的最小 Nest 容器复现：`Nest can't resolve dependencies of the ToolRoutingLogStore (?)`。smoke 手动 new 类，未覆盖真实 DI。修正可考虑显式配置 token/可选注入/工厂 provider，并补容器启动测试。
2. **P2，路由阶段阻塞且没有取消/宿主超时。** `tool-router.service.ts:177` 在 shadow 返回全量工具前仍 await 决策；BrainAgentService 在路由之后才创建 Agent、注册 abort。路由调用不传取消信号，插件卡住时占住运行与会话锁；默认 shadow 也受影响。用挂起的 fakeMotor 复现 prepareToolsForRun 一直等待。当前外部 Qwen 插件自身有 15 秒启动、30 秒请求超时，但宿主不能假定所有插件均正确实现超时。
3. **P2，错题标记误报。** `tool-router.service.ts:330` 使用 `falseNegatives.length > 0 || invokedHiddenTools.length > 0`。tool_search 可代理已经入选的工具；复现 R=[read]、A=[read]、falseNegatives=[]，仍 isFalseNegative=true。影响统计和 Few-shot 权重。漏选应按 A\\R 判断，兜底使用另记。
4. **P2，200 条错题会挤掉所有成功经验。** `tool-routing-log.store.ts:186` 的查询先 `ORDER BY is_false_negative DESC, created_at DESC` 再 `LIMIT 200`。内存数据库插入 200 条无关错题，再插入一条最新且完全匹配的成功经验，findSimilarExamples 仍返回 []。应考虑近期窗口或成功/错题分别配额，再按相似度加权。

上述行号仅供定位，修复后可能漂移。

## 验证事实与缺口

本轮实际运行：最小 Nest DI 启动探针、无磁盘写入的路由挂起/错题标记探针、SQLite `:memory:` 检索探针。未运行完整 verify:tool-router、未重新跑 MLX 真机模型，也未重新做 Electron 端到端验收。

用户报告 verify:tool-router、verify:contracts、verify:agent-runs、verify:speech-summary 全绿，但这是用户提供的验证结果，不是本轮独立复测结果。

`apps/backend/scripts/tool-router-smoke.ts` 的真机部分通过 fakeMotor 直接调用插件实例，绕过真实宿主插件加载和 ToolExecutor；因此只能证明模型/部分服务逻辑，不能独立证明完整 Motor 契约执行或 Nest 启动链路。

建议后续验收覆盖真实 Nest 容器启动、真实 Motor 加载/契约执行、路由取消与超时，以及上述两项学习数据边界。当前未确认这些问题已经修复，不应仅凭 smoke ALL PASS 宣称完整交付。

## 工作树快照与协作注意

记录时修改文件包括：backend/package.json、BrainAgentService、BrainModule、ToolExecutor、MotorToolRunnerService、neural/tool-handler.ts、contracts/index.ts；未跟踪文件包括 basal-ganglia/、tool-router-smoke.ts、router.ts、工具决策路由实施稿与 designs/。这些是既有并行工作，不是本次交接产生的代码。

此前“未开始实施”指 SuperAgent 编排 human-mry，不是工具决策路由。HEAD 的 SuperAgent 实施计划已记录 T0=bf1.1 前置切片及 T1-T6；不要把计划存在等同于全部代码已实现，也不要把两个需求混为一谈。

本次 `bd show human-6n4 --json` 在沙箱内遇到 Dolt 连接/端口错误，未核实实时 issue 状态。不要据此关闭、重置数据库或杀进程；必要时请求权限重试。

## 恢复提示词

“请阅读 docs/context/2026-11-04-restart-handoff.md，先核实 human-6n4 当前 diff 和四项审查问题是否已修复，再告诉我验证结果；未经确认不要修改功能代码。”
