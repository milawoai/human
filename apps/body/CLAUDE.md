# CLAUDE.md

## Mandatory theme contract

所有 Electron UI 修改先读 [AGENTS.md](./AGENTS.md) 的“统一主题契约”；必须复用 `--human-*` 并通过 `yarn verify:theme-usage`，不得扩大遗留基线。

@AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Essential Development Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build application for production (includes typecheck)
- `npm run typecheck` - Run TypeScript type checking for both main and renderer processes
- `npm run lint` - Lint code with ESLint
- `npm run format` - Format code with Prettier
- `npm start` - Preview the built application

### Build Commands

- `npm run build:win` - Build Windows executable
- `npm run build:mac` - Build macOS executable
- `npm run build:linux` - Build Linux executable
- `npm run build:unpack` - Build without packaging

### Type Checking (Important)

- `npm run typecheck:node` - Check main process TypeScript
- `npm run typecheck:web` - Check renderer process TypeScript
  Always run typecheck before builds as it's included in the build process.

## Application Architecture

### Electron Multi-Process Structure

This is an Electron application with Vue.js frontend, built using TypeScript and modern tooling.

**Main Process** (`src/main/`):

- Entry point: `src/main/index.ts`
- Handles system APIs, file operations, application lifecycle
- Service-oriented architecture with auto-loading services from `src/main/services/*/index.ts`

**Renderer Process** (`src/renderer/`):

- Vue 3 application with TypeScript
- PrimeVue UI components with Tailwind CSS
- Vue Router for navigation
- Component auto-imports configured

**Preload Scripts** (`src/preload/`):

- Secure IPC communication bridge
- Exposes safe APIs to renderer process

### IPC Communication System

The application uses a sophisticated IPC system with automatic handler registration:

1. **Handler Definition**: All IPC channels defined in `src/shared/datas/ipc.ts` using `defineHandlers`
2. **Auto-Registration**: Main process auto-loads services and registers handlers via `src/main/handler.ts`
3. **Type-Safe Client**: Renderer uses Vue plugin for type-safe IPC calls via `src/renderer/src/plugin/ipc.ts`

**IPC Response Format**:
All IPC calls return a standardized `BaseResponse` interface:

```typescript
export interface BaseResponse {
  success: boolean
  msg?: string | null
  data?: any | null
}
```

**Service Structure Pattern**:
Each service module in `src/main/services/[serviceName]/index.ts` exports functions that match the handler definitions.

### Core Services

**Project Service** (`src/main/services/project/`):

- Project analysis and framework detection
- Project CRUD operations with local storage
- Template-based project creation
- Electron function integration

**Code Generation** (`src/main/services/codeGen/`):

- Database analysis and code generation
- JSON analysis and form generation
- Array manipulation utilities
- SQL parsing and analysis

**Web Automation** (`src/main/services/webAuto/`):

- Browser tab management
- Web content configuration
- Automated web interactions

**Template System** (`src/main/services/template/`):

- Project template management
- Framework-specific templates (Electron, Vue)
- Dynamic template method execution

### Frontend Application Structure

**Page Organization**:

- `src/renderer/src/pages/init/` - Main project management interface
- `src/renderer/src/pages/flow-editor/` - Visual flow diagram editor (LogicFlow)
- `src/renderer/src/pages/web-auto/` - Web automation controls
- `src/renderer/src/pages/config/` - Application configuration

**Component Patterns**:

- Dialog-based workflows for project operations
- Composables for business logic (`composables/` directories)
- Auto-imported components via unplugin-vue-components

### Key Technologies

**Frontend Stack**:

- Vue 3 with Composition API
- PrimeVue for enterprise UI components
- Tailwind CSS with PrimeUI theme integration
- LogicFlow for visual flow editing
- Vue Router for navigation

**Backend/Main Process**:

- ts-morph for TypeScript AST operations
- node-sql-parser for SQL analysis
- handlebars for template rendering
- electron-store for data persistence

### Development Patterns

**Service Development**:

1. Define IPC handlers in `src/shared/datas/ipc.ts`
2. Implement service functions in `src/main/services/[service]/index.ts`
3. Services auto-register based on folder structure

**Component Development**:

- Use PrimeVue components for consistency
- Follow existing dialog patterns for user interactions
- Implement business logic in composables
- Use TypeScript interfaces from `src/shared/types/`

**IPC Usage**:

```typescript
// In Vue components
const result = await this.$ipc.serviceName.methodName(params, {
  useHooks: true,
  hookType: 'loading' // or 'confirmDialog', 'message', etc.
})
```

**Adding New Services**:

1. Create service directory: `src/main/services/[serviceName]/`
2. Implement service in `src/main/services/[serviceName]/index.ts`
3. Define handlers in `src/shared/datas/ipc.ts`
4. Services auto-register via glob import in `src/main/handler.ts`

### Project Analysis System

The application includes sophisticated project detection capabilities:

- Framework detection (React, Vue, Angular, etc.)
- Platform detection (frontend, backend, desktop, etc.)
- Git status integration
- Plugin-based architecture for extending detection rules

Configuration files and framework detection rules are located in:

- `src/main/services/project/impl/projectAnalysis/config/rules.json`
- `src/main/services/project/impl/projectAnalysis/plugins/`

### Application Features

The application is a comprehensive desktop development toolkit (桌面开发工具箱) that provides:

**Project Management**:

- Intelligent project detection for project types (frontend/backend/fullstack/desktop)
- Framework detection (React, Vue, Angular, Express, NestJS, Electron, etc.)
- Project grouping by type, Git status, tags
- Full project CRUD operations

**Code Generation Tools**:

- Database analysis and SQL parsing with code generation
- Form generation from data structures
- Data list generation
- JSON analysis and transformation utilities

**Visual Flow Editor**:

- Drag-and-drop flow diagram creation using LogicFlow
- Rich node types (functions, conditions, loops, input/output)
- Flow-to-code export (Node.js)
- Flow persistence and loading

**Web Automation**:

- Browser tab management and control
- Automated web data collection
- Web content configuration

### Important Notes

- All IPC communications are type-safe and go through the centralized handler system
- Services are auto-loaded - adding a new service requires only creating the appropriate folder structure
- The application supports both Chinese and English interfaces
- Project templates support dynamic method execution for framework-specific operations
- Web automation features integrate with system browser controls
- Use `npm` as the package manager (both `npm` and `yarn` are supported)
- Always run `npm run typecheck` before building to catch TypeScript errors early
- Node.js version is pinned to 22.17.0 via Volta configuration

## MCP Server

本应用内置了一个 MCP（Model Context Protocol）Server，启动后可供 Claude Code / Cursor 等 AI 工具调用 Electron 本地函数。

### 端口

端口统一读取自 `app.config.ts` 中的 `server.port`（当前值：**5679**）。
复制模板生成新工程时，修改该字段即可，其他地方无需改动。

### Claude Code 配置

在 `~/.claude.json`（或项目级 `.claude.json`）的 `mcpServers` 中添加以下配置：

> **MCP server 名称规则：`{package.json 的 name}localmcp`**
> 当前工程名为 `electron-serve-template`，因此名称为 `electron-serve-templatelocalmcp`。
> 复制模板后修改 `package.json` 的 `name`，同步更新此处名称即可。

```json
{
  "mcpServers": {
    "electron-serve-templatelocalmcp": {
      "url": "http://localhost:5679/mcp/rpc",
      "headers": {}
    }
  }
}
```

### 扩展 MCP 可调用函数

**`src/main/mcp-functions.json` 是 MCP 函数白名单**，只有在此文件中声明的函数才会暴露给大模型。
`src/main/services/` 下任意服务模块的函数，均可通过配置此文件纳入 MCP，与函数本身所在的服务无关。

每次新增一个可被 MCP 调用的函数，需修改两处：

**1. `src/main/mcp-functions.json` —— 追加声明（告诉大模型工具的参数与用途）**

```json
{
  "serverName": "serviceName",
  "funcName": "myFunc",
  "description": "函数功能描述",
  "params": [
    { "name": "arg1", "type": "string", "description": "参数说明", "required": true }
  ]
}
```

- `serverName`：对应 `src/main/services/{serverName}/index.ts`
- `funcName`：该文件中 `export` 的函数名

**2. `src/main/services/mcp/index.ts` —— 若涉及新服务，顶部 import 并注册到 `serviceMap`（已有服务无需重复添加）**

```typescript
// 顶部新增 import
import * as serviceName from '../serviceName/index'

// serviceMap 中新增注册
const serviceMap = {
  common: commonService,
  serviceName: serviceName,   // ← 新增这一行
}
```

### 当前白名单（`src/main/mcp-functions.json`）

| 工具名 | 所属服务 | 功能 |
|--------|----------|------|
| `common__getStore` | common | 读取 electron-store 键值 |
| `common__setStore` | common | 写入 electron-store 键值 |
| `common__deleteStore` | common | 删除 electron-store 键 |
| `common__executeShell` | common | 执行 shell 脚本 |
| `common__getProcessPlatform` | common | 获取操作系统平台标识 |
| `common__getLocale` | common | 获取当前语言设置 |
| `common__setLocale` | common | 设置当前语言 |
| `common__copyText` | common | 复制文本到剪贴板 |
| `common__isMacOS` | common | 判断是否为 macOS |
| `common__isWindows` | common | 判断是否为 Windows |
| `common__isLinux` | common | 判断是否为 Linux |
