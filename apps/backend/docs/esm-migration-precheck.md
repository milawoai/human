# Backend ESM 迁移预检与影响面清单

更新时间：2026-04-27  
对应 issue：`human-t1l.10`

## 1. 当前现状（基线）

- `apps/backend/tsconfig.json`
  - `module = "nodenext"`
  - `moduleResolution = "nodenext"`
- `apps/backend/package.json`
  - 未设置 `"type": "module"`（当前按 CJS 运行）
  - `start:prod = node dist/main`
- 实际构建产物 `apps/backend/dist/main.js` 为 CJS（`"use strict"` + `require(...)`）
- 代码中存在 3 处动态 import 兼容层（`new Function('s', 'return import(s)')`）：
  - `src/brain/language-center/llm.service.ts`
  - `src/brain/language-center/provider-auth.service.ts`
  - `src/brain/agent/brain-agent.service.ts`

## 2. 模块边界与依赖格式盘点

### 2.1 Backend 直接依赖（按包格式）

- ESM 优先/模块化包：
  - `@earendil-works/pi-ai`
  - `@earendil-works/pi-agent-core`
  - `@earendil-works/pi-coding-agent`
- CJS（或默认 CJS）：
  - `@nestjs/*`
  - `@nut-tree-fork/nut-js`
  - `better-sqlite3`
  - `socket.io`
  - `typeorm`（提供 `index.mjs`，但默认入口仍可走 CJS）
  - `rxjs`（同时提供 CJS/ESM）

### 2.2 运行模式边界

- 生产运行：`node dist/main`（当前依赖 CJS 行为）
- 开发/调试运行：`nest start --watch` / `--debug --watch`
- 脚本运行：`ts-node scripts/*.ts`（如 `verify:brain-language`）

## 3. 风险矩阵（ESM 迁移）

1. 运行入口风险（高）
- 表现：切到 `"type": "module"` 后，`node dist/main` 解析与扩展名行为会变化。
- 影响：服务无法启动。
- 缓解：同步改为 `node dist/main.js`，并先在本地验证 `start:prod`。

2. Nest 构建链路风险（高）
- 表现：Nest CLI/TS 编译输出格式与 Node runtime 预期不一致。
- 影响：编译通过但运行报 `Cannot use import statement outside a module` / `exports is not defined`。
- 缓解：先做“最小 ESM 分支”验证（只改 module 相关配置 + 启动脚本），再扩展。

3. 依赖兼容风险（中）
- 表现：部分 CJS 依赖在 ESM 下 default/named import 语义变化。
- 影响：运行时 `undefined is not a function` / 导出解析错误。
- 缓解：逐包验证关键路径（`better-sqlite3`、`typeorm`、`nestjs`、`socket.io`）。

4. 脚本生态风险（中）
- 表现：`ts-node` 直跑脚本在 ESM 下参数/加载方式变更。
- 影响：`verify:*` 与迁移脚本不可用。
- 缓解：迁移为 `tsx` 或 `node --loader ts-node/esm`，并统一脚本模板。

5. 路径映射风险（中）
- 表现：`paths`（如 `neural-topics` 指向 TS 源码）在不同运行器下解析不一致。
- 影响：脚本/调试链路找不到模块。
- 缓解：优先引入预同步/生成文件机制，避免运行时跨包解析 TS 源码。

6. 动态 import 兼容层清理风险（低-中）
- 表现：直接替换为静态 `import` 可能触发依赖初始化时机变化。
- 影响：局部行为变化。
- 缓解：分文件替换 + 每步回归 `neural/trigger` 主链路。

## 4. 迁移前置检查清单（DoD）

- [ ] `package.json` 启动脚本兼容 ESM（至少 `start:prod`、`dev`、`dev:debug`）
- [ ] 构建产物在 Node 22 下可直接启动（无 import/export 运行时错误）
- [ ] `verify:*` 脚本可用（或迁移为统一执行器）
- [ ] `brain.cortex.chat.complete` 回归通过
- [ ] `brain.agent.run` / `brain.agent.coding.run` 回归通过
- [ ] `brain.language.oauth.providers/login` 回归通过
- [ ] `dynamicImport` 兼容层全部移除并改为静态导入

## 5. 建议执行顺序（最小风险）

1. 先做“入口与构建”验证分支
- 只改运行入口/构建配置，不改业务逻辑。

2. 再做“脚本层”迁移
- 统一 `verify:*` 与 `scripts/*` 的 ESM 执行方式。

3. 最后做“代码层”清理
- 删除 `dynamicImport` 兼容层，改静态导入，逐模块回归。

## 6. 回滚策略

- 保留迁移前脚本（分支或 git tag）。
- 任何阶段出现启动级故障，先回滚到上一阶段：
  - 优先恢复 `start:prod` 与 `dev:debug` 可用。
  - 再逐项定位包导入与脚本执行器问题。
