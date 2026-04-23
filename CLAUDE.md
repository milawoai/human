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
