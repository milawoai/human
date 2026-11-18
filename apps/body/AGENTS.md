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

## 统一主题契约（强制）

适用于所有 code agent、所有新增/修改的 Electron 页面、组件、行内样式与脚本动态样式。开始前读取 `designs/theme.tokens.json`、`src/shared/theme.ts`、`src/renderer/src/theme/theme.css` 和相近的既有组件。

- 背景、表面、文字、边框、强调/焦点/选择、成功/警告/失败必须消费 `--human-*` 语义变量。字号使用 `--human-text-*`，字体使用 `--human-font-body` / `--human-font-mono`；已有圆角/阴影角色也复用中央变量。新角色先登记中央定义及所有预设，不在页面临时造变量。
- 组件库可复用 PrimeVue/TDesign，但它们的主题映射集中在 `src/renderer/src/theme/theme.css`。页面不得直接依赖旧 `--surface-*`、`--text-color*`、`--p-*` 等别名，或另写一套组件库配色。
- 禁止新增硬编码 hex/rgb/hsl/命名颜色、固定字号/字体、绕过主题的 Tailwind 配色/字号/字体类、页面内重定义 `--human-*`，以及单窗口手动切 `.app-dark`。静态、动态和行内样式同样受约束；不得用字符串拼接/变量间接绕过。
- 主题切换只经现有 `theme-set` IPC 与注册表；透明启动页/桌宠保留透明外画布，内容卡片按主题着色。布局宽高/间距、图像/Live2D模型内容本体不要求染成主题色，不借此排除页面 UI。
- 共享主题 JSON 是代码与设计规范的来源；`.pen` mode 预览和应用设置页切换是两条路径。新增预设必须能在两处选择，保留跨窗同步、字号缩放和重启恢复。

验证：`yarn verify:theme-usage`、`yarn verify:theme`；涉及设计变量时运行 `yarn theme:sync` 与 `node scripts/theme/sync-theme.mjs --check`。检查CSS/模板/脚本；类型检查和构建会自动执行门禁，PR CI另检查基线不能扩张。静态检查不替代深浅色、大字号及真实内容的视觉检查。

遗留基线 `scripts/theme/usage-baseline.json` 仅冻结既有旧模板声明，并非可复用示例。**不得扩大/重建基线、增加文件/目录豁免或移除门禁来通过测试**；触及旧视觉声明应迁至共享变量，修复后只运行 `yarn theme:prune-baseline` 缩减豁免。新页面和新组件没有基线豁免。

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
