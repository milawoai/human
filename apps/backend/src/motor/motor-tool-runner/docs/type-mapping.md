# Issue 2: 类型映射方案

## Motor Tool Runner vs pi-agent-core 类型映射

### 1. 核心类型对比

| Motor 类型 | pi-agent-core 类型 | 映射方式 |
|-----------|-------------------|---------|
| `ToolDescriptor` | `AgentTool` (metadata 部分) | 属性映射 |
| `ToolInstance.execute()` | `AgentTool.execute()` | 适配器模式 |
| `ToolResult` | `AgentToolResult` | 格式转换 |
| `ToolContext` | `BeforeToolCallContext` | 扩展兼容 |
| `capabilities[]` | 内置在 `AgentTool` 中 | 拆分/合并 |

### 2. 详细映射表

#### ToolDescriptor → AgentTool (元数据部分)

```typescript
// Motor ToolDescriptor
interface ToolDescriptor {
  id: string;              // → AgentTool.name
  name: string;            // → AgentTool.label
  description?: string;    // → AgentTool.description
  capabilities: ToolCapability[];
  // ...
}

// pi-agent-core AgentTool (元数据)
interface AgentTool {
  name: string;           // 工具唯一名称
  label: string;          // 人类可读标签
  description?: string;
  parameters: TSchema;    // Typebox 参数 schema
  // execute 方法不在这里，是另一个接口
}
```

**关键差异**：
- `ToolDescriptor.id` → `AgentTool.name`（语义不同，但用途相似）
- `ToolDescriptor.capabilities[]` 需要拆分展平为单个 AgentTool

#### ToolInstance → AgentTool

```typescript
// Motor ToolInstance
interface ToolInstance {
  descriptor: ToolDescriptor;
  status: ToolStatus;
  execute(capability, params, context): Promise<ToolResult>;
}

// pi-agent-core AgentTool
interface AgentTool<TParameters = TSchema, TDetails = any> extends Tool<TParameters> {
  label: string;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>
  ) => Promise<AgentToolResult<TDetails>>;
  executionMode?: ToolExecutionMode;
}
```

#### ToolResult → AgentToolResult

```typescript
// Motor ToolResult
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// pi-agent-core AgentToolResult
interface AgentToolResult<TDetails = any> {
  content: (TextContent | ImageContent)[];  // 返回给模型的内容
  details: TDetails;                         // 详细结果
  terminate?: boolean;                       // 是否终止
}
```

**转换规则**：
- `success: true` → `content: [{ type: 'text', text: JSON.stringify(data) }]`
- `success: false` → `content: [{ type: 'text', text: error.message }]`, `isError: true`
- `data` → `details: TDetails`
- `error` → `isError: true` + `content` 包含错误信息

#### ToolContext → 执行上下文

```typescript
// Motor ToolContext
interface ToolContext {
  sessionId: string;
  // ... 其他字段
}

// pi-agent-core BeforeToolCallContext
interface BeforeToolCallContext {
  assistantMessage: AssistantMessage;
  toolCall: AgentToolCall;
  args: unknown;
  context: AgentContext;
}
```

### 3. 参数 Schema 转换

Motor 的 capability 参数格式：
```typescript
interface ToolCapability {
  name: string;
  parametersSchema?: Record<string, {
    type: string;          // 'string' | 'number' | 'boolean' | 'array' | 'object'
    required?: boolean;
    default?: any;
    description?: string;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
  }>;
}
```

转换为 Typebox TSchema：
```typescript
import { Type } from '@sinclair/typebox';

function toTypeboxSchema(params: Record<string, any>): TSchema {
  const properties: Record<string, TSchema> = {};
  const required: string[] = [];

  for (const [key, spec] of Object.entries(params)) {
    let schema: TSchema;
    switch (spec.type) {
      case 'string':
        schema = Type.String({
          description: spec.description,
          maxLength: spec.maxLength,
        });
        break;
      case 'number':
        schema = Type.Number({
          description: spec.description,
          minimum: spec.minimum,
          maximum: spec.maximum,
        });
        break;
      case 'boolean':
        schema = Type.Boolean({ description: spec.description });
        break;
      case 'array':
        schema = Type.Array(Type.Unknown(), { description: spec.description });
        break;
      case 'object':
        schema = Type.Object(toTypeboxSchema(spec.properties || {}));
        break;
      default:
        schema = Type.Unknown();
    }

    if (spec.default !== undefined) {
      // Typebox 不直接支持 default，需要在 execute 时处理
    }

    properties[key] = schema;
    if (spec.required) {
      required.push(key);
    }
  }

  return Type.Object(properties, { required });
}
```

### 4. 执行流程映射

```
Motor 执行流程:
  ToolHandler.handleExecute()
    → ToolExecutor.execute(toolId, capability, params, context)
      → ToolInstance.execute(capability, params, context)
        → 返回 ToolResult

pi-agent-core 执行流程:
  Agent.run()
    → agentLoop()
      → 调用 AgentTool.execute(toolCallId, params, signal, onUpdate)
        → 返回 AgentToolResult
```

**统一后的流程**:
```
Agent / App
    │
    ▼
ToolAdapterService.toAgentTool(toolInstance)
    │
    ▼
AgentTool.execute() ──► 内部调用 ToolExecutor.execute()
                            │
                            ▼
                      ToolInstance.execute()
                            │
                            ▼
                      返回 AgentToolResult
```

### 5. 边界情况处理

| 情况 | Motor 处理 | pi-agent-core 处理 | 统一方案 |
|------|-----------|-------------------|---------|
| 工具不存在 | 返回 `ToolResult.success: false` | 抛出错误 | 适配器捕获，转换为 AgentToolResult |
| 工具未就绪 | 返回 `ToolResult.success: false` | — | 同上 |
| 能力不支持 | 返回 `ToolResult.success: false` | — | 同上 |
| 执行超时 | 内部超时处理 | signal.abort | 使用 AbortSignal |
| 执行错误 | 捕获异常返回 ToolResult | 抛出错误 | 适配器捕获转换为 content |

### 6. 转换函数签名

```typescript
// ToolResult → AgentToolResult
function toAgentToolResult(result: ToolResult): AgentToolResult {
  if (result.success) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data) }],
      details: result.data,
    };
  } else {
    return {
      content: [{ type: 'text', text: result.error?.message || 'Unknown error' }],
      details: result.error,
      isError: true,  // 需要通过 afterToolCall 钩子设置
    };
  }
}

// ToolInstance → AgentTool
function toAgentTool(tool: ToolInstance, hooks?: ToolHooks): AgentTool {
  return {
    name: tool.descriptor.capabilities[0]?.name || tool.descriptor.id,
    label: tool.descriptor.name,
    description: tool.descriptor.description,
    parameters: toTypeboxSchema(tool.descriptor.capabilities[0]?.parametersSchema || {}),
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 调用 ToolExecutor 执行
      const result = await toolExecutor.execute(
        tool.descriptor.id,
        tool.descriptor.capabilities[0]?.name,
        params,
        { sessionId: toolCallId, signal, onUpdate }
      );
      return toAgentToolResult(result);
    },
    executionMode: 'parallel',
  };
}
```

### 7. 关键设计决策

1. **一个 ToolInstance 对应多个 AgentTool**：ToolInstance 可能支持多个 capability，每个 capability 对应一个 AgentTool
2. **执行模式统一**：pi-agent-core 的 `sequential`/`parallel` 执行模式，通过 `beforeToolCall`/`afterToolCall` 钩子实现
3. **结果格式桥接**：ToolExecutor 返回 ToolResult，适配器转换为 AgentToolResult
4. **AbortSignal 传递**：通过 ToolContext 传递，允许工具执行被取消