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

所有新功能开发遵循**「提出 → 讨论 → 实施 → 实现 → 结果」五阶段文档链**。双库分工：动机/讨论/结论在 Obsidian（思考的家），实施/实现在本仓库（与代码同版本演进）。

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
| `功能/进行/` | 实施与联调 | 交付并写完结果记录 → 迁 `完成/` |
| `功能/完成/` | 已交付（只读归档） | — |

### 五阶段规则（对任何 code agent 生效）

1. **开工新功能前**：
   - 用 `bd create` 建跟踪 issue（见 beads 约定），优先级即文件夹 P 级
   - 在 `功能/讨论/P<级>-<功能名>-<YYMMDD>/` 建文件夹，写 `<功能名>-提出.md`（为什么做、痛点、最初想法，几段话即可），并在 `功能/README.md` 索引登记一行
2. **设计讨论**：同文件夹写 `<功能名>-讨论稿.md`（多轮迭代，文内带修订记录）；讨论稿不进本仓库
3. **写代码前**：**功能文件夹从 `讨论/` 迁入 `进行/`**；在本仓库 `docs/plans/YYYY-MM-DD-<功能名>.md` 写实施稿（任务分解、接口定义、改动点清单）
4. **实现完成后**：在同一实施稿内更新「实现记录」节（实际改动清单 + 验证输出 smoke/E2E）。代码是真相，文档记结论
5. **功能交付**：大功能在 `docs/milestones/` 写交付记录；功能文件夹迁入 `完成/`；更新 Obsidian `功能/README.md` 索引状态

### 文档库位置

- **Obsidian 文档库**（提出/讨论/结果/系统说明）：`/Users/zhou/Desktop/obsidian/work/工程/规划中/秘书自动化/`，导航入口为该库 `README.md`
- **修改任何系统的行为时，必须同步更新 Obsidian 中对应的 `<system>-system/说明文档.md`**（sensory / neural / brain / memory / motor / body 六份）
- 本仓库文档：`docs/plans/`（实施稿）、`docs/milestones/`（交付记录）、`doc/`（模块修改规范）

完整约定（含各阶段模板与示例）见 Obsidian 库 `功能/README.md`。
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
