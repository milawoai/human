# Motor-Animation SQLite 数据库配置

## 概述

`motor-animation` 模块使用 TypeORM + better-sqlite3 作为本地数据库方案，数据库文件位于 `~/.ai_secretary/sqlite/motor.db`。

## 核心文件

| 文件 | 职责 |
|------|------|
| `src/database/database.module.ts` | TypeORM SQLite 全局配置，数据库连接、目录创建 |
| `src/motor/motor.module.ts` | 注册 Entity、Controller、Service，决定哪些表被管理 |
| `src/motor/motor-animation/entities/` | Entity 定义，字段类型使用 SQLite 兼容类型 |

## 数据库配置

配置位于 `src/database/database.module.ts`：

- **驱动**：`better-sqlite3`（原生 C++ 绑定，同步 API）
- **数据库路径**：`~/.ai_secretary/sqlite/motor.db`
- **`synchronize: true`**：启动时自动同步表结构
- **`autoLoadEntities: true`**：只同步被 `forFeature()` 注册的 Entity

## 表同步机制

不是扫描数据库已有表，而是根据代码中声明的 Entity 决定同步哪些表。

链路：

```
DatabaseModule (autoLoadEntities: true + synchronize: true)
    ↓
MotorModule → TypeOrmModule.forFeature([Entity1, Entity2, ...])
    ↓
TypeORM 启动时只为注册的 Entity 自动建表/同步结构
```

当前注册的 4 张表（`src/motor/motor.module.ts`）：

| Entity | 表名 |
|--------|------|
| `AutomationSet` | `automation_sets` |
| `ButtonAction` | `button_actions` |
| `CoordinateAction` | `coordinate_actions` |
| `ScrollAction` | `scroll_actions` |

## 新增 Entity / 表

1. 在 `src/motor/motor-animation/entities/` 下新建 Entity 文件，继承 `BaseEntity`
2. 在 `src/motor/motor.module.ts` 的 `TypeOrmModule.forFeature([...])` 数组中添加新 Entity
3. 启动 NestJS 后 TypeORM 自动建表

## Entity 字段类型规范（SQLite）

从 MySQL 迁移到 SQLite 的类型映射：

| MySQL | SQLite (TypeORM) | 说明 |
|-------|------------------|------|
| `bigint unsigned` | 不指定 type（默认 integer） | 主键自增 |
| `tinyint` | `integer` | 布尔/枚举值 |
| `varchar(N)` | `text` | 字符串 |
| `json` | `simple-json` | TypeORM 自动 JSON.stringify/parse |
| `timestamp(6)` + `CURRENT_TIMESTAMP(6)` | 移除（TypeORM 自动处理） | 时间字段 |

`comment` 属性保留，TypeORM 在 SQLite 下忽略但不报错。

## 数据迁移

一次性 MySQL → SQLite 迁移脚本：`scripts/migrate-mysql-to-sqlite.ts`

```bash
cd apps/backend
npm install mysql2
npx ts-node -r tsconfig-paths/register scripts/migrate-mysql-to-sqlite.ts
```

运行前需在脚本中配置 `MYSQL_CONFIG`（host、port、user、password、database）。
