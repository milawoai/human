# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd sync               # Sync with git
```

<!-- BEGIN DOC LIFECYCLE -->
## Feature Documentation Lifecycle (MANDATORY)

所有新功能开发遵循**「提出 → 讨论 → 实施 → 实现 → 测试 → 交付 → 抽象」七阶段文档链**。双库分工：动机/讨论/详细实现稿/测试/交付/抽象在 Obsidian（人类与 AI 共同阅读），实施计划与代码侧实现/验证记录在本仓库（与代码同版本演进）。**术语统一以 Obsidian 库 `名词字典.md` 为准，重要新概念先入字典再用。**

### 启动阅读与需求定位（强制）

- 文档库根目录：`/Users/zhou/Desktop/obsidian/work/工程/规划中/秘书自动化/`。
- 启动路线：本文件 → 文档库 `名词字典.md` → `功能/README.md` → 本次需求的 `-提出.md` / `-讨论稿.md` → 所引用需求的相关能力与验收记录 → 仓库实施稿。CLAUDE.md 只保留入口摘要，不复制另一套规则或需求状态表。
- 用户给出需求时，先定位 **正式需求名 + bd issue ID + 当前阶段 + 文档路径**；同名词存在多义时明确所属系统/场景，不凭简称猜测。按引用定位相关小节，不要求每次通读全工程或全库。
- 每份提出记录和实施稿开头均须包含「来源与关联需求」：衍生自、使用、被衍生、硬前置、对应 issue ID 与可打开的文档链接；使用项写清复用的能力、边界/版本与适用阶段。实施稿还须反链本需求提出/讨论稿。未知关系写「待确认」，确认没有才写「无」。
- 链接必须指向实际笔记，不能把 `P1-某功能-261026` 文件夹当作 Obsidian 笔记链接；重命名后以稳定需求名/issue ID 追溯。`uses` 是复用说明，不自创未支持的 Beads 依赖类型；确实阻塞开工才额外登记 `blocks`。
- 衍生或复用关系确定时同步双方的来源/被衍生/被使用记录；硬依赖仍以 Beads 为权威。字典负责含义，功能索引负责文档导航，Beads 负责状态与阻塞，代码与测试证据负责实现事实；有冲突时不得用字典覆盖代码事实或把讨论设想写成已实现。

### 功能文件夹命名（强制）

```
功能/<状态>/<P优先级>-<功能名>-<YYMMDD>/
```

- 示例：`功能/进行/P1-TTS插件化-261019/`
- **优先级**：与该功能 bd issue 的 priority 一致（P0 critical … P4 backlog），issue 优先级变更时文件夹同步改名
- **日期**：提出日期（YYMMDD），建档后不再变
- **功能名**：不含空格（如 Pi Durable → `PiDurable`）

### 状态子文件夹与迁移（强制）

功能随进展**整体迁移**文件夹（名字不变）：

| 位置 | 何时在此 | 迁出条件 |
|---|---|---|
| `功能/讨论/` | 新功能建档（提出 + 讨论设计） | bd claim 并开始动代码 → 迁 `进行/` |
| `功能/进行/` | 实施、实现、测试 | 实现完成 + 测试记录 + 交付记录齐备 → 迁 `完成/` |
| `功能/完成/` | 已交付基线归档；允许追加⑦抽象、勘误与关联，不覆盖原验收事实 | — |

### 功能依赖与文档展示（强制）

- **优先级不等于执行顺序**：P 级表达重要性，硬前置决定能否开工；`讨论/进行/完成` 表达进展，不代替阻塞状态。
- **Beads 是依赖关系的权威来源**：只有已确认的硬前置使用 `blocks` 依赖；`discovered-from` 仅表示来源，软关联与待确认关系不得当作阻塞。添加方向为 `bd dep add <被阻塞issue> <前置issue> --json`。
- **每份讨论稿必须包含「依赖与被依赖」节**：列出硬前置、下游被依赖项、软关联、待确认关系；每项附 bd issue ID、相关文档链接、阻塞的具体阶段/能力，以及可并行部分。没有依赖时明确写「无」，未评估时写「待确认」，不可留空冒充无依赖。
- **功能总索引必须展示依赖**：Obsidian `功能/README.md` 的索引表至少包含「硬前置」「可并行部分」列，并提供依赖总览图（推荐 Mermaid）。节点标明功能/子任务和 issue ID，箭头统一为「前置 → 被阻塞项」；仅阻塞某阶段时须明确标注，不画成整个功能被阻塞。
- **按最小可交付任务建依赖**：尽量将接口定义、最小 Job 能力、取消/恢复等拆成子任务，避免用大功能互相阻塞。硬依赖图必须无环；不能因架构相关就建立双向阻塞。
- **同次变更同步维护**：依赖新增/删除或优先级调整时，同步更新 Beads、受影响的双方讨论稿、总索引表和依赖图；优先级变更还须按命名规则同步目录与链接。文档是 Beads 的可读视图，不另建任务状态或 markdown TODO 跟踪系统。
- **开工前核实阻塞**：查看 `bd ready --json`、相关 issue 的前置状态及讨论稿。高优功能依赖低优任务时，应评估提升最小前置任务的优先级，不自动提升整个关联功能，也不绕过未完成的硬前置。

### 七阶段规则（对任何 code agent 生效）

1. **开工新功能前**：
   - 用 `bd create` 建跟踪 issue（见 beads 约定），优先级即文件夹 P 级
   - 在 `功能/讨论/P<级>-<功能名>-<YYMMDD>/` 建文件夹，写 `<功能名>-提出.md`——**必须含「来源与关联需求」节**：衍生自（derived-from）/ 使用（uses）/ 被衍生；无关联时写「无来源（全新提出）」，不可留空。机器侧同步 beads：衍生用 `discovered-from`、硬阻塞用 `blocks`（见下节）。并在 `功能/README.md` 索引登记一行
2. **设计讨论**：同文件夹写 `<功能名>-讨论稿.md`（多轮迭代，文内带修订记录 + 「依赖与被依赖」节，见下）；讨论稿不进本仓库
3. **写代码前**：**功能文件夹从 `讨论/` 迁入 `进行/`**；在本仓库 `docs/plans/YYYY-MM-DD-<功能名>.md` 写实施稿（任务分解、接口定义、改动点清单）
4. **实现完成后**：仓库实施稿更新「实现记录」（改动清单与 smoke/E2E 证据），并在 Obsidian 功能文件夹写 `<功能名>-实现稿.md`，不能只给提交总结。详细实现稿至少包含源码职责、真实调用时序、关键协议/字段、状态与持久化、故障与取消边界、常见修改落点、验证/排错步骤和限制；标明代码基线，与提出/讨论稿及仓库记录互链。代码是真相，详细实现正文放 Obsidian，不维护两份独立演进的副本。
5. **测试**：功能文件夹写 `<功能名>-测试.md`，记录需求验收点→用例/命令→实际结果，区分自动测试、真人试听/体验、未测与失败；注明日期、代码提交/版本及证据位置。执行在本仓库 smoke/E2E，文档记结论与偏差，不把构建通过等同真实业务验收。
6. **交付**：每次交付须有范围、使用方法、已知限制、测试记录链接及遗留 issue；在 Obsidian 写 `<功能名>-交付.md` 或链接已有里程碑，大功能另在 `docs/milestones/` 保存代码侧记录。整项验收与交付齐备才迁 `完成/`；仅子阶段完成时留在 `进行/`，明确本次范围。
7. **抽象**：交付后写 `<功能名>-抽象.md`，记录可复用能力/边界/证据、适用与不适用场景、复盘及衍生需求；阶段性交付可先在 `进行/` 写本阶段抽象。抽象是评估与沉淀，不等于必须重构或发布新插件；无可提炼项写明理由。抽象记录应链接测试/交付记录，新术语同步字典；新需求的「衍生自」与原需求的「被衍生」同步补记，不擅自实施范围外的重构。

### 名词字典与文档一致性（强制）

- 唯一术语正文为文档库 `名词字典.md`；仓库入口仅引用，不复制全文。每项至少含正式名、英文/别称、定义、职责/易混边界和权威文档；规划能力标明「候选/讨论中」，不要因收录即认为已实现。
- 同义词归到同一正式名，同名异义按场景拆开（如 Neural 能力注册与插件能力、播报摘要与上下文摘要、审批门控与播放令牌）。既有代码标识和历史引用不强改，注明对应正式名。
- 修改概念定义时，同步本次涉及的启动入口、功能规范、系统说明和需求文档；历史版本保留，通过修订记录指向现行定义。引用的目标与标题必须真实存在。

### 开发中途扩展（三分法，防止单需求膨胀）

- **实现细节不合适**（不改契约/接口）→ 就地修复：实施稿「实现记录」追加，**不新建文档**
- **设计方案不合适**（改架构/接口/契约）→ 讨论稿新增修订版本（写明推翻了什么、为什么），实施稿任务清单同步更新
- **想到相关功能**（超出本需求范围）→ **派生新需求**：当日新建功能文件夹（P级-名字-今日日期），其提出.md「来源与关联需求」写 derived-from 本需求；本需求提出.md「被衍生」补记一行；bd 建 issue 加 `--deps discovered-from:<父id>`

### 文档库位置

- **Obsidian 文档库**（提出/讨论/测试/交付/抽象/系统说明/名词字典）：`/Users/zhou/Desktop/obsidian/work/工程/规划中/秘书自动化/`，导航入口为该库 `README.md`
- **修改任何系统的行为时，必须同步更新 Obsidian 中对应的 `<system>-system/说明文档.md`**（sensory / neural / brain / memory / motor / body 六份）
- 本仓库文档：`docs/plans/`（实施稿）、`docs/milestones/`（交付记录）、`doc/`（模块修改规范）

完整约定（含各阶段模板、需求关联示例与扩展三分法详解）见 Obsidian 库 `功能/README.md`。
<!-- END DOC LIFECYCLE -->

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- BEGIN BEADS INTEGRATION -->
## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**

```bash
bd ready --json
```

**Create new issues:**

```bash
bd create "Issue title" --description="Detailed context" -t bug|feature|task -p 0-4 --json
bd create "Issue title" --description="What this issue is about" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**

```bash
bd update <id> --claim --json
bd update bd-42 --priority 1 --json
```

**Complete work:**

```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task atomically**: `bd update <id> --claim`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" --description="Details about what was found" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`

### Auto-Sync

bd automatically syncs with git:

- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

For more details, see README.md and docs/QUICKSTART.md.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

<!-- END BEADS INTEGRATION -->
