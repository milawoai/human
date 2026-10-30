# Agent 运行管理 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提供内嵌 Pi Agent 的同会话互斥、明确取消、独立状态查询与桌面恢复观察。

**Architecture:** Brain持有进程内运行登记，先登记再初始化，取消传播Pi AbortSignal；只有执行真正settle才释放锁。Body通过查询观察状态，HTTP错误不自动重试任务。此登记不充当持久Job或Durable。

**Tech Stack:** NestJS/TypeScript、现有Pi Agent、Electron/Vue、ts-node smoke。

## 来源与关联需求

主需求human-152，Obsidian `功能/完成/P1-Agent测试与运行管理-261026/Agent测试与运行管理-提出.md` 与 `Agent测试与运行管理-讨论稿.md`。来源human-sl2已交付Agent测试页；复用AgentSessionStore、既有Neural命令/查询/事件、Body测试页。硬前置均已具备。关联human-ogp委派、human-bjb运行时、human-bf1公共Job，但不在此实现它们；下游使用运行控制需按接口确认，不自创blocks。

## 实施步骤

1. 新增 `apps/backend/scripts/agent-run-management-smoke.ts`：真实BrainService与可控Agent fixture覆盖并发抢占前置、取消信号、初始化期间取消、失败释放、未知查询及有限缓存；先运行失败。
2. 新增 `brain/agent/agent-run-registry.ts`，运行ID与会话分离、状态机running/cancelling/succeeded/failed/cancelled、instanceId；改BrainAgentService接线，不重写并行中的buildTools。新增run.get/run.cancel能力，三端topic同步。
3. Body Agent服务新增查询/取消IPC；界面增加停止及检查状态、保持会话ID用于重开恢复观察。断线不重发、不宣称停止；正常结果仍用原链路，不能让原请求晚到覆盖新运行。
4. backend运行管理/Pi回归/播报回归/typecheck/build；Body现有测试/新增纯状态测试/typecheck/build。无外部模型调用的测试不冒充真实云模型验收。
5. Body源码先保存精确基线，只归档本次增量patch并验证重放；同步Obsidian实现/测试/交付/抽象及brain/body系统说明。保留其他会话修改，选择性提交推送。

## 状态语义与限制

同会话只允许一个活跃运行，锁在第一个await前取得。取消幂等，Pi.abort传播既有Motor signal，但不保证不合作插件停止、撤销副作用或中止TTS。取消时不播报。执行未settle仍cancelling并占锁。查询无记录明确unknown；返回instanceId区分进程，不保证崩溃恢复。只保留有限终态记录，不缓存大事件或消息。当前本地Neural信任边界不新增多用户鉴权承诺。

## 实现与验证记录

2026-10-30已实现进程内控制基线；实现正文、测试、交付、抽象在上述Obsidian完成目录。

- 后端AgentRunRegistry与Brain接线：先锁再初始化，runId独立，取消幂等且仅实际settle后确认；状态查询与通知；终态最多200个，active不淘汰。正常运行响应新增runId/runStatus，未提供runId时兼容message.id。
- Body：停止、检查状态、2秒轮询，localStorage最近sessionId/runId恢复观察；8秒控制请求超时，执行请求超时不重发；旧响应/事件按runId隔离。原Main任务期间关闭窗口改为隐藏。Body源码7文件用patches/body-agent-run-management.patch归档，生成器会隔离并行modelConfig IPC变更，并在独立目录重放逐文件比对。
- 同一共享工作区中，另一会话的f098a1e提交已带入本功能后端运行登记与topic源码；本次不改写该提交历史，补交相关测试、Body补丁、计划与文档，保留其他路由改动。
- 测试先行：最初查询断言失败于未支持brain.agent.run.get；实现后verify:agent-runs覆盖互斥、初始化/运行期间取消、幂等、失败释放、错配/未知、终态限额及实际Pi工具AbortSignal，均通过。受控Agent保持不返回时，取消仍cancelling且互斥有效。
- 回归：verify:agent-panel、verify:speech-summary、verify:contracts，backend typecheck/build，Body test:agent(8项)/test:speech/test:tts、node/web typecheck与build:no-lint通过。契约负例ERROR为预期；已有模块类型/Browserslist/分包警告未在本功能扩改。
- 真实Electron/CDP验收：fixture服务复用真实BrainService，但用可控Agent/内存历史；页面运行→刷新同一任务→停止→后端cancelled→下一任务succeeded通过。scripts/verify-agent-run-management.cjs核对专用fixture header才发任务，避免误调用实际模型；服务为apps/backend/scripts/agent-run-desktop-fixture.ts，需先停止真实12002服务，fixture绑定失败时不得杀其他进程。真实Pi到工具signal由独立smoke证明，不把两类证据混为云模型全链路。
- 补丁反向检查、独立重放与精确比对通过；不把并行模型配置UI、contracts/router.ts等改动带入本功能补丁/提交。
- 独立只读审查覆盖锁、settle取消、HTTP/刷新观察、旧事件/响应隔离和补丁范围，未发现阻断交付的P1/P2缺陷。最终构建重跑Electron E2E通过，测试fixture与Electron均已关闭。

限制：重启/记录淘汰后unknown，不支持持久恢复；非合作插件可能保持cancelling，不承诺强杀进程树、撤销文件副作用、TTS计算取消或多用户公网鉴权。Durable/公共Job/外部代理仍归human-bjb/human-bf1/human-ogp。Body元数据问题human-ryp保留。
