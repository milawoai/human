# AI项目分析Prompt使用说明

## 概述

这个prompt系统用于让AI助手分析项目并返回结构化的JSON数据,可以直接用于填充项目创建表单。

## 工作流程

```
1. 用户点击"AI分析"按钮
   ↓
2. 创建任务,获得taskId (作为taskToken)
   ↓
3. 生成包含taskToken的完整prompt
   ↓
4. AI通过MCP工具获取项目信息
   ↓
5. AI分析项目并生成JSON结果
   ↓
6. AI通过MCP工具report_task_result提交结果
   ↓
7. 任务完成,自动填充表单
```

## MCP工具要求

### 1. get_project_analysis_params

AI调用此工具获取项目的详细信息。

**返回格式示例:**

```json
{
  "package.json": {
    "name": "my-vue-app",
    "dependencies": {
      "vue": "^3.3.0",
      "typescript": "^5.0.0"
    }
  },
  "README.md": "项目说明...",
  "fileStructure": {
    "src/": ["components/", "views/", "App.vue"],
    "package.json": true
  }
}
```

### 2. report_task_result

AI调用此工具提交分析结果。

**参数:**

- `taskToken`: string - 任务标识符(就是taskId)
- `result`: string - JSON格式的分析结果

**result格式:**

```json
{
  "name": "项目名称",
  "description": "项目描述(100-200字)",
  "languageIds": [1],
  "tags": ["标签1", "标签2"],
  "platformCode": 1
}
```

## Prompt结构

生成的prompt包含以下部分:

1. **任务信息** - taskToken、项目路径、现有分析数据
2. **可选列表** - 框架、语言、标签、平台的完整列表
3. **分析要求** - 返回的JSON结构说明
4. **分析步骤** - 详细的执行步骤
5. **注意事项** - 重要提醒
6. **示例结果** - 参考示例

## 使用示例

```typescript
import { generateProjectAnalysisPrompt } from '@shared/prompts/aiProjectAnalysis'

// 生成prompt
const prompt = generateProjectAnalysisPrompt({
  projectPath: '/path/to/project',
  taskToken: 'task-uuid-123',
  frameworks: [
    { id: 1, name: 'React' },
    { id: 2, name: 'Vue' }
  ],
  languages: [
    { id: 1, name: 'TypeScript' },
    { id: 2, name: 'JavaScript' }
  ],
  tags: [
    { id: 1, name: '前端' },
    { id: 2, name: '后台管理' }
  ],
  platforms: [
    { code: 1, key: 'frontend', label: '前端' },
    { code: 2, key: 'backend', label: '后端' }
  ],
  existingAnalysis: {
    name: 'my-project',
    desc: '现有描述',
    hasGit: true
  }
})

// 将prompt发送给AI
await sendToAI(prompt)
```

## 返回数据映射

AI返回的JSON会自动映射到表单字段:

| AI返回字段   | 表单字段     | 类型     | 说明           |
| ------------ | ------------ | -------- | -------------- |
| name         | name         | string   | 项目名称       |
| description  | description  | string   | 项目描述       |
| languageIds  | languageIds  | number[] | 语言ID数组     |
| tags         | tags         | string[] | 标签名称数组   |
| platformCode | platformCode | number   | 平台代码(单个) |

## 平台代码说明

- `1` - Frontend (前端项目)
- `2` - Backend (后端项目)
- `3` - Desktop (桌面应用)
- `4` - Mobile (移动应用)
- `5` - Fullstack (全栈项目)
- `6` - Shell (脚本/工具)
- `7` - Other (其他)

## AI分析示例

### 输入

项目路径: `/Users/dev/vue-admin`

### AI分析过程

1. **调用MCP工具获取信息:**

```typescript
get_project_analysis_params()
```

2. **分析项目特征:**

- package.json显示使用了Vue 3、TypeScript、Vite
- 依赖包含element-plus、vue-router、pinia
- README描述这是一个后台管理系统
- 目录结构包含src/views、src/components

3. **生成JSON结果:**

```json
{
  "name": "Vue3 Admin Dashboard",
  "description": "一个基于Vue3和TypeScript构建的现代化后台管理系统...",
  "languageIds": [1],
  "tags": ["后台管理", "Vue3", "TypeScript"],
  "platformCode": 1
}
```

4. **提交结果:**

```typescript
report_task_result({
  taskToken: 'task-uuid-123',
  result: JSON.stringify(result)
})
```

### 输出

表单自动填充完成!

## 注意事项

1. **taskToken必须准确** - AI必须使用提供的taskToken调用report_task_result
2. **ID必须匹配** - languageIds必须从提供的列表中选择
3. **JSON格式** - 返回的result必须是有效的JSON字符串
4. **标签灵活** - tags可以使用列表中的,也可以创建新标签
5. **必须调用MCP工具** - AI必须调用report_task_result,否则任务无法完成

## 调试技巧

1. **查看生成的prompt:**

```typescript
console.log('AI分析Prompt:', finalPrompt)
```

2. **监控任务状态:**

```typescript
const status = await ipc.task.getTaskStatus({ taskId })
console.log('任务状态:', status)
```

3. **检查AI返回:**

```typescript
console.log('AI分析成功:', result)
```

## 扩展

如果需要添加新的分析字段:

1. 在prompt中添加字段说明
2. 在result JSON结构中定义字段
3. 在NewProjectDialog.vue的回调中处理新字段
4. 更新projectFormConfig以支持新字段
