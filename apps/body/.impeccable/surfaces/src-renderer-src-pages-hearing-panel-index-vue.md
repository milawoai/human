---
version: 1
slug: "src-renderer-src-pages-hearing-panel-index-vue"
primary_target: "src/renderer/src/pages/hearing-panel/index.vue"
related_targets: []
---

# 听觉面板（hearing-panel）

## Mode

Operate

## Surface Purpose

「听见世界」的观察窗：ASR 实时字幕流（prepared/started/vad/segment/stopped/error 事件）、识别状态与文本校对。

## Primary Jobs

- 实时读到达的识别分段，判断系统是否在听
- 校对/编辑识别文本并发送到会话窗口继续对话
- 错误与停止状态一目了然（ASR 不可用时给出可理解的失败态）

## Binding Constraints

- 紧凑面板空间角色；滚动字幕区不得被装饰元素挤压
- 状态色仅承载含义（listening/error/idle），并配文字标签
