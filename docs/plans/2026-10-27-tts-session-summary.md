# 会话级 TTS 总结播报 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 会话默认静音；用户开启后，以一次模型生成产出正文和最多 80 字的独立总结，经已安装 TTS 插件与 Live2D 播放。

**Architecture:** Cortex 与 Pi Agent 共用 Brain speech 的提示词、严格摘要解析和插件编排。模型在正文末尾输出专用结构化摘要块，后端剥离为独立 speech 字段，流式正文不显示摘要块；不将协议要求永久写进基础提示词。Body 保存会话开关并发送快照，仅在当前会话、当前请求且仍开启时播放。失败保留正文，不回退全文、不额外请求模型。Agent 的设置随会话文件保存，桌面本地会话设置即时保存并用于覆盖恢复值。

**Tech Stack:** NestJS/TypeScript、现有 pi-agent-core、Motor tts@1.0、Electron/Vue、Node assert smoke。

## 范围与依赖

硬前置：既有 tts@1.0 契约、外部插件加载、Qwen3-MLX 同步合成与 Body perform（均已实现）。human-op5 的 P5 与 human-bf1 Job 层不是本次前置；不实现异步克隆或流式分句。现有 apps/body 是缺失独立 Git 元数据的 gitlink，沿用 patches/ 的交付方式，保留可重放增量补丁，不改 gitlink 结构。

## Task 1: Brain 摘要协议（测试先行）

Files: `apps/backend/src/brain/speech/speech-summary.ts`、`apps/backend/scripts/speech-summary-smoke.ts`。

先写断言并运行 `yarn workspace backend verify:speech-summary`，确认缺失实现失败。实现仅开启时注入的提示词、终端 JSON 摘要块提取、80 字限制、拒绝代码/路径/空值/重复或残缺块、流式前缀隐藏。再运行至通过。

## Task 2: Brain 插件编排与模型链路

Files: `brain/speech/brain-speech.service.ts`、`brain/cortex/brain-cortex.service.ts`、`brain/agent/brain-agent.service.ts`、`brain/agent/agent-session.store.ts`、`brain/brain.module.ts`、`scripts/speech-summary-smoke.ts`。

先测试关闭零调用、开启使用类别发现与标准合成、无插件/失败不抛出、第二插件可替换、Cortex 正文与摘要分离、Pi 最后一条最终回复才播报。实现并保持正文完成事件先行；会话只保存基础提示词，不累积播报指令。

## Task 3: Body 会话开关与播放

Files: `apps/body/src/shared/session-speech.ts` 及测试、`shared/agent-panel.ts`、`renderer/src/pages/{chat-panel,agent-panel}/index.vue`、`main/services/sense/impl/hearing/index.ts`。

先用 `node --experimental-strip-types --test` 覆盖默认关闭、按会话隔离、恢复开关、过期或已关闭请求不播放、错误降级。实现两面板复选框；复用 `ipc.live2d.perform({text,audioUrl})`，只读 Brain 返回的独立 speech 字段，不再在 Body 二次合成；播放错误显示非致命提示。普通聊天窗口保留一个独立会话 ID，关闭窗口重开可恢复设置，新会话显式重置关闭。

## Task 4: 验证与交付

运行 Brain 摘要 smoke、既有 verify:agent-panel、verify:contracts、backend typecheck/build、Body test:agent/test:tts/摘要测试、Body 两套 typecheck/build。真实插件短句合成后检查音频 URL 与有效字节；能启动 Electron 时验收播放字幕口型，不能实测则明确记录。更新本稿实现记录、Obsidian 讨论稿依赖/现状及 brain/body 系统说明；导出 Body 增量补丁并验证可重放。提交前 `git diff --check`，更新 Beads，提交推送。human-op5 不因本次 P3 完成而错误关闭其 P5。

## 实现记录

本期 `human-6mb` 已实现并通过验收；主线 `human-op5` 的 P4/P5 不因此视为全部完成。

- Brain 新增 `speech-summary.ts` 与 `BrainSpeechService`：单次生成附加终端 JSON 摘要块，由后端拆成独立 `speech` 字段；有效正文及最多80字符的摘要才合成。通过 Motor 的标准类别发现和执行接口调用，无 Qwen 专属代码，故障只返回 speech.failed。
- Agent 使用 Pi `transformContext` 注入请求级指令，避免恢复后的 leading system message 吞掉新提示，也不把播报要求永久保存到会话。会话文件向后兼容地保存 `speechSummaryEnabled`，没有该字段的旧会话默认关闭。只用本轮最终正常完成的 assistant 文本，不播中间工具结果或失败消息。
- Cortex 正文完成事件不等合成。实测暴露并修复既有流解析问题：`text_end` 完整快照不能重复追加，`thinking_delta` 必须走思考通道；回归测试包含真实 Pi 事件形态。最终正文以模型最终消息为准。
- Body 两个面板增加会话级复选框；即时本地保存（本机明确值优先于后端恢复值），新会话关闭。普通聊天保留一个独立会话 ID，未借此声称实现了持久上下文。只有当前且仍开启的请求可调用 `perform`，合成/播放失败仅显示提示；不提供停止已开始播放的控制。
- Body 的14文件增量归档为 `patches/body-session-speech-summary.patch`（生成器 `scripts/archive-body-speech-patch.cjs`），不改变现有 gitlink 结构。
- 独立审查补齐两个边界：Cortex 只在 `stopReason=stop` 且无模型错误时播报（error/aborted/length 保留文字但不播报）；每轮播报携带 Main 进程的 scope/token 租约，关闭、新请求、切会话或卸载使其失效。Pet 在异步模型/音频初始化之后、真正 audio.play 之前再次核实令牌，防止已发出的 IPC 冷启动后插播。普通手动 perform 无令牌，保持兼容。

验证：

- `yarn workspace backend verify:speech-summary`：协议/长度/异常摘要、默认关闭、类别发现与第二插件切换、异常降级、Cortex真实事件类型、实际 Pi Agent、真实会话文件开关保存全部通过。
- `verify:agent-panel`、`verify:contracts`、backend typecheck/build 通过。契约 smoke 中的 ERROR 日志是预期的无效插件负例。
- Body `test:speech`（3项）、`test:agent`（7项）、`test:tts`（4项）、node/web typecheck、build:no-lint 通过；仅有既存模块类型、Browserslist 和构建分包警告。
- `node scripts/verify-speech-summary.cjs` 通过真实默认 zai-glm 模型、已安装 qwen3-mlx、Electron UI/IPC：Agent 新会话默认关闭、恢复启用与本机关闭偏好；真实摘要→音频→字幕；HTTP 200、CORS *、RIFF WAV；音频进度0.32秒时采集到峰值字节偏移40（相对静音128），证明音频分析驱动路径有信号。普通聊天真实总结自动播放亦通过。
- 实测摘要示例：「我说明了可以帮助你回答问题、分析信息、写作和提供建议。」完整答案没有显示传输摘要块。试听品质仍由用户评价，自动化不等于主观音质验收。
- 审查后的补充验证：模型 error/aborted/length 均零合成；异步准备中租约失效的单测通过；真实 IPC 失效令牌返回 audioPlayed=false 且零新增播放。最初尝试用 AudioContext.resume 挂起冷启动的探针不成立（旧驱动不等待 resume，音频已开始），已删除该不确定探针，不将其声称为冷启动实测证据。冷启动后置检查由实际播放前 gate 与可控异步单测覆盖。

运维：只启动并关闭本次测试后端、Electron、TTS worker 与 cmux 事件子进程；没有改动已安装插件或模型配置。测试会话保留在最近会话中，音频由插件缓存策略管理；临时 Body 基线在 `/private/tmp/human-tts-body-7VLcpU`，不是交付依赖。后续正常启动 `yarn start:backend` 与 `yarn start:electron` 即可使用。
