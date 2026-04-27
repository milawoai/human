# 秘书自动化 Future Epic（未开始）

更新时间：2026-04-27
来源：`bd list --json`

## 筛选规则
- 仅统计 `issue_type = epic`
- 且 `status = open`（未开始）

## 未开始 Epic 列表

1. `human-t1l`  
   标题：Brain System 接入 pi-ai / pi-agent-core / pi-coding-agent  
   优先级：P1

2. `human-dbf`  
   标题：Backend: 统一从 neural-topics 引用 topic 常量（清理手写字符串）  
   优先级：P2

3. `human-3p0`  
   标题：Brain OAuth统一接口联调与验收（Google/Codex）  
   优先级：P2

4. `human-hmj`  
   标题：Backend: neural-topics 预同步机制（替代运行时 import）  
   优先级：P2

5. `human-t1l.11`  
   标题：Backend ESM 迁移（后续）  
   优先级：P2

## 备注
- `human-t1l.8` 当前为 `in_progress`，不计入“未开始 epic”。
- 后续建议按依赖和主线优先级推进：`human-t1l` → `human-dbf` → `human-hmj` / `human-3p0` / `human-t1l.11`。
