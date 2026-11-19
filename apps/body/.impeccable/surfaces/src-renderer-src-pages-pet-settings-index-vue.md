---
version: 1
slug: "src-renderer-src-pages-pet-settings-index-vue"
primary_target: "src/renderer/src/pages/pet-settings/index.vue"
related_targets: []
---

# 桌宠设置窗口（pet-settings）

## Mode

Operate

## Surface Purpose

应用设置主页（默认路由）：桌面秘书的设置中心——主题预设选择、字号缩放、模型档案快切器、后端生命周期面板等。

## Primary Jobs

- 切换五套主题预设并即时预览（与 .pen 设计板是两条路径，选择结果必须一致）
- 调整字号（100%/112.5%/125%）并重启后保持
- 观察后端托管/注册健康状态（human-lf5 B/C 能力的入口之一）

## Binding Constraints

- 纵向分组组织内容；设置页标签横向分组，选中态用强调边框+文字
- 首启/初始化流程组件（pages/init）在本窗口语境下使用
- 主题切换只经 theme-set IPC 与注册表；不得单窗口手动切 .app-dark
