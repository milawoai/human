# Electron IPC 添加指南

## 概述

Electron (Body) 的 IPC 系统采用**声明式自动注册**架构，只需在两处添加代码即可完成一个新 IPC 接口：

1. 定义 handler 声明（`src/shared/datas/ipc.ts`）
2. 实现服务函数（`src/main/services/<service>/index.ts`）

渲染进程通过 Vue 插件 `$ipc` 自动获得类型安全的调用能力，**无需手动注册 `ipcMain.handle`**。

## 架构原理

```
渲染进程                       主进程
─────────────────────────────────────────────────
this.$ipc.sense.startHearing(params)
        │
        ▼
  ipcRenderer.invoke('sense-startHearing', params)
        │                    ▲
        │                    │ ipcMain.handle 自动注册
        │                    │
        │           handler.ts 遍历 defineHandlers
        │           通过 import.meta.glob 自动加载 services/*/
        │           匹配 servicesName → funcName
        │                    │
        └────────────────────► service.startHearing(params)
```

## 核心文件

| 文件 | 职责 |
|------|------|
| `src/shared/datas/ipc.ts` | Handler 声明表（`defineHandlers`） |
| `src/main/handler.ts` | 自动注册：遍历声明表 + glob 加载服务模块 |
| `src/main/services/<name>/index.ts` | 服务实现：导出与声明匹配的函数 |
| `src/shared/types/ipc.ts` | 类型定义（`BaseResponse`、`HandlerConfig`） |
| `src/renderer/src/plugin/ipc.ts` | 渲染进程 IPC 插件 |

## 添加步骤

### 以 `sense.getHearingStatus` 为例

#### 第 1 步：在 `ipc.ts` 添加 handler 声明

文件：`apps/body/src/shared/datas/ipc.ts`

```ts
export const defineHandlers = {
  // ...已有配置...
  sense: {
    startHearing: { desc: '开启监听' },
    stopHearing: { desc: '停止监听' },
    getHearingStatus: { desc: '获取监听状态' },  // ← 新增
  },
}
```

**配置规则：**

| 字段 | 必须 | 说明 | 默认值 |
|------|------|------|--------|
| `desc` | 否 | 功能描述（仅供注释） | — |
| `servicesName` | 否 | 服务模块名 | 取外层 key（如 `sense`） |
| `funcName` | 否 | 函数名 | 取内层 key（如 `getHearingStatus`） |
| `ipcName` | 否 | IPC channel 名 | `{外层key}-{内层key}` |

**默认映射规则：**
- `servicesName` 默认 = 外层 key（`sense`）
- `funcName` 默认 = 内层 key（`getHearingStatus`）
- `ipcName` 默认 = `sense-getHearingStatus`
- 对应的服务文件路径 = `src/main/services/sense/index.ts`

#### 第 2 步：实现服务函数

文件：`apps/body/src/main/services/sense/index.ts`

```ts
import { getHearingStatus } from './impl/hearing'

export { startHearing, stopHearing, getHearingStatus }
```

**函数签名要求：**

```ts
export const getHearingStatus = async (): Promise<BaseResponse> => {
  return {
    success: true,
    data: { isListening: false, neuralReady: true }
  }
}
```

- 必须 `export`（handler.ts 通过动态 import 获取）
- 必须返回 `Promise<BaseResponse>`
- 函数名必须与 `ipc.ts` 中的 `funcName`（或内层 key）一致

#### 第 3 步：渲染进程调用

```vue
<script setup>
// 通过 $ipc 全局属性调用
const result = await $ipc.sense.getHearingStatus()

// 带 hooks 的调用方式
const result = await $ipc.sense.startHearing(
  { subtitle_mode: true },
  { useHooks: true, hookType: 'loading' }
)
</script>
```

**可用 hookType：**

| hookType | 效果 |
|----------|------|
| `loading` | 显示全局 loading |
| `message` | 成功/失败 toast 提示 |
| `confirmDialog` | 结果展示在确认弹窗中 |
| `log` | 仅 console.log |
| `silent` | 无任何 UI 反馈（默认） |

## 添加新服务模块

如果需要创建全新的服务（如 `notification`），需要创建目录结构：

```
src/main/services/
  └── notification/
      └── index.ts        # 导出所有 handler 函数
```

**`index.ts` 模板：**

```ts
import type { BaseResponse } from '@shared/types/ipc'

export const sendNotification = async (params: { title: string; body: string }): Promise<BaseResponse> => {
  // 实现逻辑...
  return { success: true }
}

export const getNotificationList = async (): Promise<BaseResponse> => {
  return { success: true, data: [] }
}
```

然后在 `ipc.ts` 添加声明：

```ts
export const defineHandlers = {
  // ...
  notification: {
    sendNotification: { desc: '发送通知' },
    getNotificationList: { desc: '获取通知列表' },
  },
}
```

`handler.ts` 会通过 `import.meta.glob('./services/*/index.ts')` 自动发现新模块，无需手动注册。

## 注意事项

1. **函数必须导出**：`handler.ts` 使用 `serviceModule[funcName]` 查找函数，未导出的函数无法被调用
2. **返回值必须是 `BaseResponse`**：所有 handler 的返回值都会经过 `wrapResponse` 包装，但建议直接返回正确格式
3. **不要手动注册 `ipcMain.handle`**：所有注册由 `handler.ts` 的 `initializeHandlers()` 自动完成
4. **文件位置固定**：服务必须放在 `src/main/services/<name>/index.ts`，否则 glob 扫描不到
5. **命名冲突**：同一服务组（外层 key）内不允许有重名的 handler
