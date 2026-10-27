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

- 功能开发遵循七阶段文档链：提出 → 讨论（Obsidian 文档库）→ 实施 → 实现（本仓库 `docs/plans/`）→ 测试 → 交付 → 抽象；提出记录必须含「来源与关联需求」节
- 功能文件夹命名：`功能/<讨论|进行|完成>/<P优先级>-<功能名>-<YYMMDD>/`，优先级与 bd issue 一致；随进展在三个状态文件夹间整体迁移
- 功能依赖遵循 AGENTS.md「功能依赖与文档展示」：Beads 为权威来源；讨论稿写「依赖与被依赖」，功能索引展示硬前置、可并行部分及依赖图；区分硬阻塞、软关联和待确认关系，按最小任务建无环依赖，变更时同步维护 Beads 与相关文档
- 术语统一以 Obsidian 库 `名词字典.md` 为准；修改任何系统行为，须同步更新 Obsidian 中对应的 `<system>-system/说明文档.md`

@AGENTS.md
