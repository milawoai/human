# 代码修改指南

本目录记录各功能模块的代码修改规范和操作手册。

## 功能索引

| 功能 | 描述 | 详情 |
|------|------|------|
| Neural Topics | Neural Core topic 常量统一管理，三端（Electron / NestJS / Python）共享的 topic 定义 | [neural-topics.md](./neural-topics.md) |
| Electron IPC | Electron 主进程/渲染进程 IPC 接口的声明与实现，自动注册机制 | [electron-ipc.md](./electron-ipc.md) |
| Motor-Animation SQLite | motor-animation 模块 TypeORM + better-sqlite3 数据库配置，Entity 注册与同步机制 | [motor-animation-sqlite.md](./motor-animation-sqlite.md) |
