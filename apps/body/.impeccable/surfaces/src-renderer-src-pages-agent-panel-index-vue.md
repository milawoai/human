---
version: 1
slug: "src-renderer-src-pages-agent-panel-index-vue"
primary_target: "src/renderer/src/pages/agent-panel/index.vue"
related_targets: []
---

# Agent 面板（agent-panel）

## Mode

Operate

## Surface Purpose

Agent 测试与运行管理（human-152 基线）：Pi Agent 会话的模型推理与工具调用循环观察、取消/同会话互斥/桌面恢复观察。

## Primary Jobs

- 发起/观察/取消一次 Agent 运行，看清当前状态（status 标签 + 文字）
- 读工具调用循环的过程信息，失败时定位到具体环节
- 同会话互斥与恢复行为可验证

## Binding Constraints

- 状态色仅标注运行状态并配文字；面向开发验证，密度可高于面向最终用户的窗口
- 控件复用中央组件角色，不因「工具页」而绕过主题契约
