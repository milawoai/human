---
version: 1
slug: "src-renderer-src-pages-hello-index-vue"
primary_target: "src/renderer/src/pages/hello/index.vue"
related_targets: []
---

# 启动窗口（hello）

## Mode

Operate

## Surface Purpose

应用启动的第一印象（human-lwg 启动窗口与初始化进度）：初始化任务进度、后端拉起状态，启动完成即让位。

## Primary Jobs

- 让用户知道「正在启动、进行到哪一步、还要多久」
- 初始化失败时给出可诊断的错误态而不是无声卡死
- 生命周期短暂：进度走完即关闭，不承载常驻功能

## Binding Constraints

- 透明启动页保留透明外画布，内容卡片按主题着色（启动卡片沿用主题 shadow）
- 窗口尺寸遵循 startup window-size 服务（screen 工作区计算），UI 不自行假设固定尺寸
- 进度语义与 startup tasks 服务的阶段对齐，不虚构进度
