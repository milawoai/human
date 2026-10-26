# Human — AI 桌面助手

Electron 桌面应用，集成 AI 语音交互、自动化操作、Neural 总线通信。

## 工程结构

- `apps/backend/` — NestJS 后端服务 (端口 12002)
  - Motor Animation: 自动化操作管理，TypeORM + better-sqlite3，数据库 `~/.ai_secretary/sqlite/motor.db`
  - Neural Core: 内部 Actor/Capability/Subscription 总线系统
  - Brain: 内部命令处理器
- `apps/body/` — Electron 主进程 + 渲染进程
- `apps/python-service/` — Python 服务（ASR/VAD 等语音处理）
- `packages/neural-topics/` — Neural topic 常量，三端共享

## 关键文档

- `doc/code_modify/` — 各模块代码修改规范

## Agent 强制规则（先读）

本工程的完整强制规则见 [AGENTS.md](./AGENTS.md)（issue 跟踪、功能文档生命周期、非交互命令、会话收尾）——**开始任何工作前先读它**。要点：

- 功能开发遵循五阶段文档链：提出 → 讨论（Obsidian 文档库）→ 实施 → 实现（本仓库 `docs/plans/`）→ 结果
- 修改任何系统行为，须同步更新 Obsidian 中对应的 `<system>-system/说明文档.md`

@AGENTS.md
