# Human 数字化秘书 — 工程解析报告

> 生成时间：2026-04-23

---

## 一、项目概述

**Human** 是一个 AI 桌面助手项目，基于 Electron + NestJS + Python 构建，集成 AI 语音交互、自动化操作和 Neural 总线通信三大核心能力。项目采用典型的**主进程 + 多端协作**架构，核心通信由 Neural Core 总线统一调度。

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Human 数字化秘书                                │
│                                                                         │
│  ┌──────────────┐    HTTP / WS    ┌──────────────────────┐             │
│  │  apps/body   │ ◄─────────────► │   apps/backend       │             │
│  │  (Electron)  │                 │   (NestJS :12002)   │             │
│  │              │                 │                      │             │
│  │  - 主进程     │                 │  ┌───────────────┐  │             │
│  │  - 渲染进程   │                 │  │ Neural Core   │  │             │
│  │  - Live2D 宠物│                 │  │ (Actor总线)   │  │             │
│  └──────────────┘                 │  ├───────────────┤  │             │
│                                  │  │ Brain        │  │             │
│                                  │  │ (命令处理)   │  │             │
│                                  │  ├───────────────┤  │             │
│                                  │  │ Motor        │  │             │
│                                  │  │ (自动化)     │  │             │
│                                  │  └───────────────┘  │             │
│                                  └──────────────────────┘             │
│                                        │                                  │
│                                 HTTP (12002→12003)                      │
│                                        │                                  │
│                                  ┌─────▼─────┐                           │
│                                  │ apps/     │                           │
│                                  │ python-   │                           │
│                                  │ service   │                           │
│                                  │ (FastAPI  │                           │
│                                  │  :12003)  │                           │
│                                  └───────────┘                           │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  packages/neural-topics/  ← 三端共享的 Topic 常量定义               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、应用模块详解

### 3.1 apps/body — Electron 主应用

**职责**：桌面客户端入口，提供用户交互界面和 Live2D 宠物窗口。

| 组件 | 描述 |
|------|------|
| **主进程** | `src/main/` — 窗口管理、系统托盘、全局快捷键、IPC 服务、本地 HTTP 服务器 |
| **渲染进程** | `src/renderer/` — Vue 3 界面、Live2D 渲染、字幕显示、宠物交互 |
| **shared** | `src/shared/` — IPC 声明表、宠物配置、表演协议类型定义 |

**技术栈**：
- Electron (主进程)
- Vue 3 + Vite (渲染进程)
- Tailwind CSS
- Live2D Cubism WebSDK
- Express (本地服务器，端口 12001)

**核心能力**：
- 透明、置顶的 Live2D 宠物窗口
- 点击交互（触发动作）、拖拽移动、滚轮缩放
- 字幕/动作/表情/音频驱动
- 系统托盘管理、全局快捷键

**IPC 系统**：采用声明式自动注册，只需在 `ipc.ts` 定义 handler 声明 + 在 `services/` 实现服务函数，handler.ts 自动完成注册。

### 3.2 apps/backend — NestJS 后端服务

**职责**：核心业务中枢，运行端口 **12002**，包含三大子系统：

#### 3.2.1 Neural Core（通信中枢）

详见 `apps/backend/src/neural/README.md`。

**定位**：统一消息入口 + 路由中心 + 订阅中心 + 协议层。所有子系统之间的通信**必须经过 Neural Core**，禁止直连。

**架构**：
```
Electron ←HTTP/Ws→ Neural Core ←Ws→ Python
                      ↑
                      │
                   Local Adapter
                      ↑
                   NestJS (Brain/Motor)
```

**核心概念**：
- **Actor**：运行时进程标识（electron/nest/python）
- **Capability**：Actor 注册的能力（谁**能**做什么）
- **Subscription**：Actor 订阅的兴趣（谁**想**接收什么）
- **BusMessage**：统一消息信封（command/query/control/event/response/error）

**路由策略**：
| 消息类型 | 路由策略 |
|----------|----------|
| command / control / query | 定向路由（查 Capability → 发给对应 Actor） |
| event | 广播（查 Subscription → 推给所有订阅者） |
| response / error | 回源（根据 target/correlationId 返回） |

**通信方式**：
| 方式 | 用途 |
|------|------|
| HTTP POST | 一次性触发、查询、管理（端口 12002） |
| WebSocket (Socket.IO) | 注册、订阅、事件流、长连接 |
| Local Adapter | NestJS 内部调用 |

**Topic 命名规范**：`{system}.{module}.{entity}.{verb}`
- system：sensory / brain / motor / body
- 示例：`sensory.hearing.caption_stream.enable`

#### 3.2.2 Brain（命令处理系统）

**职责**：处理 AI 对话、模型管理、系统初始化等高级命令逻辑。

**模块**：
| 模块 | 描述 |
|------|------|
| `brain/init` | 系统初始化与健康检查 |
| `brain/cortex` | 对话与响应生成（完整/流式） |
| `brain/language-center` | 模型配置查询、校验与切换 |

#### 3.2.3 Motor（自动化操作）

**职责**：管理和执行桌面自动化操作。

**数据库**：SQLite（`~/.ai_secretary/sqlite/motor.db`），由 TypeORM + better-sqlite3 驱动。

**当前管理的表**：
| Entity | 表名 | 用途 |
|--------|------|------|
| AutomationSet | automation_sets | 自动化动作集 |
| ButtonAction | button_actions | 按钮点击操作 |
| CoordinateAction | coordinate_actions | 坐标点击操作 |
| ScrollAction | scroll_actions | 滚动操作 |

### 3.3 apps/python-service — Python 服务

**职责**：语音处理服务，运行端口 **12003**，基于 FastAPI 构建。

**模块**：
| 模块 | 描述 |
|------|------|
| `module/sensory/sensory_hearing` | ASR 语音识别、字幕流、VAD 检测 |

**技术栈**：
- FastAPI（ASGI 服务器）
- 语音识别模型（ONNX 格式，配置在环境变量 `AUDIO_MODEL_ROOT`）
- Uvicorn

**常用接口**：
```bash
curl http://localhost:12003/api/v1/asr/models   # 查询可用 ASR 模型
curl http://localhost:12003/api/v1/asr/status   # 查询状态
```

### 3.4 packages/neural-topics — 共享常量包

**职责**：定义 Neural Core 的 topic 常量，三端（Electron/NestJS/Python）共享。

**文件**：`topics.json`
- 版本：1.0.0
- 当前定义的 topic：
  - `sensory.hearing.caption_stream` — 字幕流控制与事件
  - `brain.init` — 系统初始化
  - `brain.cortex.chat` — 对话生成
  - `brain.language.models` — 模型管理

---

## 四、典型业务流程

### 4.1 字幕监听流程

```
1. 用户触发监听 → Body (Electron)
                        ↓ HTTP POST /neural/trigger
2. Neural Core 路由 → 查 Capability → 找到 Python Sensory
                        ↓ WS 定向发送
3. Python Sensory 执行 → 启动 ASR 录音 + VAD 检测
                        ↓ WS emit message (event)
4. Neural Core 广播 → 查 Subscription → 找到 Body
                        ↓ WS 推送
5. Body 渲染字幕 → 渲染进程更新字幕 UI
```

---

## 五、技术栈汇总

| 层级 | 技术 | 端口 |
|------|------|------|
| 桌面客户端 | Electron + Vue 3 + Tailwind CSS | — |
| 前端渲染 | Live2D Cubism WebSDK | — |
| 后端核心 | NestJS | 12002 |
| 通信总线 | Neural Core (Socket.IO) | 12002 |
| 自动化数据库 | SQLite + TypeORM | — |
| 语音服务 | FastAPI + Python | 12003 |
| 语音模型 | ONNX ASR | — |

---

## 六、关键文档

| 文档 | 路径 | 描述 |
|------|------|------|
| Neural Core 详细文档 | `apps/backend/src/neural/README.md` | Actor/Capability/Subscription 总线系统完整说明 |
| Motor 数据库配置 | `doc/code_modify/motor-animation-sqlite.md` | TypeORM + SQLite 配置与迁移指南 |
| Electron IPC 添加指南 | `doc/code_modify/electron-ipc.md` | 声明式 IPC 自动注册机制 |
| Neural Topics 定义 | `packages/neural-topics/topics.json` | 三端共享的 topic 常量 |
| Neural 系统架构图 | `doc/system-analysis/neural-system.md` | Neural 总线的架构与流程图 |

---

## 七、工程亮点

1. **Actor 模型通信**：Neural Core 采用 Actor 模式，所有子系统通过统一消息总线通信，解耦彻底
2. **声明式 IPC**：Electron 端采用声明式 IPC 注册，代码量少且易于维护
3. **跨端技术统一**：TypeScript 同时覆盖 Electron 和 NestJS，Python 处理 ASR，各司其职
4. **本地 SQLite**：Motor 模块从 MySQL 迁移到 SQLite，降低部署复杂度
5. **Live2D 集成**：创新的桌面宠物形态，提供自然的 AI 交互入口

---

*报告由 Claude Code 自动生成*
