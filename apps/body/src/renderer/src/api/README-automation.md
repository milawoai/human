# AutomationApi 使用指南

本文档说明如何使用 `AutomationApi` 进行自动化操作管理。

## 快速开始

```typescript
import { AutomationApi } from './automation'

// 获取自动化集合列表
const sets = await AutomationApi.getAutomationSets({ page: 1, size: 10 })

// 创建新的自动化集合
const newSet = await AutomationApi.createAutomationSet({
  name: '我的自动化',
  description: '描述信息'
})
```

## API 接口分类

### 1. 集合管理接口

#### 获取自动化集合列表

```typescript
const result = await AutomationApi.getAutomationSets({
  page: 1, // 页码，可选，默认1
  size: 10, // 每页数量，可选，默认10
  name: '登录' // 名称搜索，可选
})
```

#### 创建自动化集合

```typescript
const result = await AutomationApi.createAutomationSet({
  name: '登录流程', // 必填
  description: '登录描述' // 可选
})
```

#### 更新自动化集合

```typescript
const result = await AutomationApi.updateAutomationSet({
  id: 1, // 必填
  name: '新名称', // 可选
  description: '新描述' // 可选
})
```

#### 删除自动化集合

```typescript
const result = await AutomationApi.deleteAutomationSet({
  id: 1 // 必填
})
```

### 2. 操作管理接口

#### 获取集合的所有操作

```typescript
const result = await AutomationApi.getActions(setId)
```

#### 插入操作到指定位置

```typescript
const result = await AutomationApi.insertActions({
  setId: 1,
  index: 0, // 插入位置
  list: [
    // 操作列表
    {
      actionType: 'coordinate',
      actionData: {
        x: 100,
        y: 200,
        clickType: 'click'
      },
      waitTime: 1000,
      label: '点击登录按钮'
    }
  ]
})
```

#### 删除指定位置的操作

```typescript
const result = await AutomationApi.deleteActions({
  setId: 1,
  indexList: [0, 1, 2] // 要删除的索引列表
})
```

#### 修改指定操作

```typescript
const result = await AutomationApi.updateAction({
  actionId: 1,
  actionType: 'coordinate',
  data: {
    x: 150,
    y: 250,
    clickType: 'doubleClick',
    waitTime: 1500,
    label: '双击登录按钮'
  }
})
```

### 3. 导入导出接口

#### 导出自动化配置

```typescript
const result = await AutomationApi.exportAutomation(setId)
```

#### 导入配置创建自动化

```typescript
const result = await AutomationApi.importAutomation({
  name: '导入的自动化',
  config: {
    description: '从文件导入',
    actions: [
      // 操作列表
    ]
  }
})
```

### 4. 配置选项接口

#### 获取配置选项

```typescript
// 获取所有选项
const allOptions = await AutomationApi.getOptions()

// 获取特定类型选项
const buttonTypes = await AutomationApi.getOptions({
  type: 'button-types'
})
```

### 5. 执行接口

#### 执行自动化

```typescript
const result = await AutomationApi.autoMate({ id: setId })
```

## 操作类型说明

### 坐标操作 (coordinate)

```typescript
{
  actionType: 'coordinate',
  actionData: {
    x: 100,           // X坐标
    y: 200,           // Y坐标
    clickType: 'click' // 点击类型: click, doubleClick, longPress, rightClick
  },
  waitTime: 1000,     // 等待时间(毫秒)
  label: '操作描述'    // 操作标签
}
```

### 按钮操作 (button)

```typescript
{
  actionType: 'button',
  actionData: {
    buttonType: 'Enter',        // 按钮类型: Enter, Space, Tab, Escape, Arrow, Ctrl, Alt, Shift
    keyCombination: 'Ctrl+C'    // 组合键(可选)
  },
  waitTime: 500,
  label: '按键操作'
}
```

### 滚动操作 (scroll)

```typescript
{
  actionType: 'scroll',
  actionData: {
    direction: 'down',    // 滚动方向: up, down, left, right
    distance: 300,        // 滚动距离
    duration: 1000        // 滚动持续时间
  },
  waitTime: 200,
  label: '滚动操作'
}
```

## 错误处理

所有API调用都返回统一的响应格式：

```typescript
{
  success: boolean,    // 操作是否成功
  data?: any,         // 返回数据
  message?: string,   // 错误或成功消息
  total?: number      // 列表查询时的总数
}
```

建议使用 try-catch 进行错误处理：

```typescript
try {
  const result = await AutomationApi.getAutomationSets({ page: 1 })
  if (result.success) {
    console.log('成功:', result.data)
  } else {
    console.error('失败:', result.message)
  }
} catch (error) {
  console.error('请求异常:', error)
}
```

## 使用示例

参考 `automation-example.ts` 文件中的完整使用示例，包含：

1. 基本CRUD操作
2. 批量操作管理
3. 完整工作流程
4. 工具函数使用

## 注意事项

1. 所有接口都支持 `toBack` 参数，用于控制是否通过后端代理调用
2. 坐标操作的坐标值应该是屏幕上的实际像素位置
3. 等待时间单位为毫秒，建议根据实际需要设置合理的等待时间
4. 操作标签有助于调试和维护，建议为每个操作添加有意义的标签
