# 实施稿：SuperAgent 编排最小闭环（human-mry）

> 状态：已批准实施，按依赖排序执行 ｜ 讨论稿：Obsidian `功能/讨论/P2-SuperAgent编排模式-261102/SuperAgent编排模式-讨论稿.md`（v3，2026-11-03 定稿）
> 性质：跨需求协调的**集成实施稿**——T0 属 human-bf1（前置切片），T1+ 属 human-mry 本体；不新建私有执行引擎。

## 0. 定稿决策记录（2026-11-03，用户确认采纳讨论稿 §9 推荐候选）

1. **关联 UX**：显式任务号优先；唯一未闭环任务且话语明显指向 → 默认关联 + 可见提示可纠正；普通问题独立回答；多候选/含糊 → 列候选确认。不采用无条件最近任务/时间窗/模型自报置信度。
2. **首期目标修订**：仅验收一个后台只读 Worker。目标 A→B：更新目标版本 → 标记旧产物过期 → 旧 Job 请求取消并等待真实 settle → 显式创建关联同一语义任务的新 Job。不并行覆盖、不自动重放、不假装重用已结束 Job；单纯附加背景仅记录；取消失败/失联保持未确认。
3. **首期恢复边界**：重启后对账；无法确认的运行呈现 unknown，绝不视为已停止并自动重做；暂不提供跨进程续跑，但 bf1.1 必须定义 Job 记录保留与 unknown 的可观察行为。

## 1. 任务分解与顺序

| # | 任务 | 属 | 依赖 | 说明 |
|---|---|---|---|---|
| **T0** | **Job 最小切片**（= human-bf1.1，open P1，先决） | human-bf1 | — | 提交（幂等）/观察（投影+序号）/取消（settle 语义）/故障（unknown）+ 只读 fixture；范围与验收见 bf1 讨论稿 bf1.1 节，存储与 API 细节由其实现稿定。开工时 claim `human-bf1.1`，bf1 文件夹按其治理迁移 |
| T1 | 语义任务记录与目标修订 | human-mry | T0 | Brain 侧 SemanticTask 存储（见 §2），goalRevisions/jobRefs/过期标记；修订触发决策 2 流程 |
| T2 | 关联解析与准入 | human-mry | T1 | 按决策 1 实现输入分类（新建/普通提问/补充/取消），产出关联决策 + 可见提示数据 |
| T3 | chat-panel 任务可见性与操作 | human-mry | T2 | 任务投影卡（jobId/目标版本/状态）、「补充到任务X」提示、查询/取消按钮、受理vs启动 toast 区分 |
| T4 | 只读 Worker 适配 | human-mry | T0 | 经 Agent 委派通道拉起只读 Worker：无外发权限（无文件写入/消息发送），汇报 = report + evidence 引用 + needs_input |
| T5 | fixture 验证套件 | human-mry | T0 | 幂等重放、乱序通知、取消 settle、重启 unknown、前台并发响应——无副作用 fixture |
| T6 | 真实只读 Worker E2E + 验收 | human-mry | T1-T5 | 讨论稿 §7 场景逐项实测（fixture 与真实代理证据分开记录） |

执行顺序：**T0 →（T1/T2/T3/T4 可并行开发，集成在 T0 之后）→ T5 → T6**。mry 文件夹于 T1 开工时迁 `进行/`；T0 属 bf1 治理（bf1.1 开工时 bf1 文件夹自行迁移）。

## 2. 核心接口与数据（消费方契约，最终以 bf1.1 实现稿为准）

### 2.1 Job API（T0 提供，mry 消费）

```ts
// 提交（幂等：同 idempotencyKey 重放不产生第二执行）
job.submit { idempotencyKey, kind: 'readonly-worker', spec: { prompt, cwd, allowedTools } }
  → { jobId, state: 'accepted' | 'started' }
// 观察（投影唯一权威 Job 记录，带版本/序号）
job.status { jobId } → { state: 'accepted'|'running'|'succeeded'|'failed'|'cancelled'|'unknown', seq, resultRef? }
// 取消（受理 ≠ 结束；实际 settle 后经事件确认）
job.cancel { jobId } → { requested: true }  → 事件 job.settled { jobId, seq, outcome }
```

### 2.2 SemanticTask（T1，Brain 侧存储——**不是第二套执行状态**）

```ts
interface SemanticTask {
  taskId: string;                    // 业务任务标识（chat-panel 可见）
  title: string;
  goalRevisions: Array<{             // 用户确认的目标，修订版本化
    version: number; content: string; confirmedAt: number;
  }>;
  jobRefs: Array<{                   // 关联的执行（投影，终态以 Job 为准）
    jobId: string; targetVersion: number; stale?: boolean;
  }>;
  status: 'open' | 'fulfilled' | 'cancelled';   // 业务状态，不冒充 Job 终态
  scope: { workspace?: string };     // 用户/项目权限范围（4.5 校验用）
}
```

- 存储：SQLite（Brain database module 内新表）；**不含** queued/running 等执行态字段——那些只投影自 Job
- 过期规则：目标升版后，旧 targetVersion 的 jobRefs 置 `stale: true`，呈现层不得作为最新交付展示

### 2.3 关联解析（T2，讨论稿 4.5 决策表的实现）

```
解析顺序（命中即停）：
1. 显式任务号/显式选择 → 关联指定任务（失效引用报错，不回退）
2. 唯一未闭环任务 + 话语明显指向（实体/意图匹配）→ 默认关联 + 界面可见「补充到任务X」
3. 明显独立问题 → 独立回答
4. 其余（多候选/含糊指向）→ 列候选询问，确认前零变更
最近发生/时间窗/模型置信度：仅辅助排序候选，不得作为唯一依据
```

### 2.4 Worker 约束（T4）

- 工具白名单：只读（read/grep/ls 类 + bash 只读命令），无 write/edit、无消息发送、无网络外发
- 汇报结构：`{ report, evidenceRefs[], needsInput? }`——对用户呈现由协调方决定
- 结构化字段由 agent@1.0 契约定稿（human-ogp），本稿不假定已实现

## 3. 验收映射（讨论稿 §7 → 本稿测试项）

| §7 验收点 | 测试项 |
|---|---|
| 后台不阻塞前台 | T5：worker running 中，前台独立问答 p95 < 阈值（实施时定，先测基线） |
| 关联与去重 | T5：幂等重放/乱序通知无第二执行；T6：决策表五种输入情形逐一验证 |
| 任务修订 | T6：A→B 实测——旧产物标过期、新 Job 关联同任务、旧结果不作为 B 呈现 |
| 查询与取消 | T5：cancel 受理→settle 才确认；T6：查询反映真实执行 |
| 输出与权限 | T4：Worker 工具白名单测试（写操作被拒）；报告经协调方呈现 |
| 故障边界 | T5：重启对账 → unknown；失败不自动重放 |

## 4. 不做什么（继承讨论稿 §8）

云端/daemon、自动修代码、群聊接入、多信道平台、模型 Watchdog、复杂订阅、全量长期记忆、整体 Durable 迁移、添加供应商式的新交互面——均不在本稿范围。

## 5. 实现记录

（实施后回填：改动清单 + 验证输出；T0 部分记录于 bf1 侧，此处引用）

