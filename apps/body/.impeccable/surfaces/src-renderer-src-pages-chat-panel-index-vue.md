---
version: 1
slug: "src-renderer-src-pages-chat-panel-index-vue"
primary_target: "src/renderer/src/pages/chat-panel/index.vue"
related_targets: []
---

# 会话窗口（chat-panel）

## Mode

Operate

## Surface Purpose

与秘书对话的主工作台：语音/文字问答、回答流式展示、TTS 播报状态与会话历史。

## Primary Jobs

- 发起提问并快速读到回答（含流式更新与工具调用过程的状态提示）
- 掌握播报状态：正在播报/可停止/已结束，避免过期播报
- 回看本会话历史与摘要播报入口

## Binding Constraints

- 紧凑面板：沿用 space-panel/related 空间角色，不套普通页面内距
- 会话气泡尾角使用 bubble-tail；状态含义同时用文字表达，不只靠颜色
- 主题/字号跟随全局注册表，跨窗同步
