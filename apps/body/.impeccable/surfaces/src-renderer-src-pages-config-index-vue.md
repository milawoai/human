---
version: 1
slug: "src-renderer-src-pages-config-index-vue"
primary_target: "src/renderer/src/pages/config/index.vue"
related_targets: []
---

# 模型配置窗口（config）

## Mode

Operate

## Surface Purpose

可视化模型配置（human-48b）：默认档案与模型的查看/切换、连通测试（含 Ollama 探测）、通道清单对比。

## Primary Jobs

- 快速确认「当前用的是哪个模型」并一键切换默认档案
- 连通测试：真实探测后端/Ollama，失败时给出下一步动作
- 密钥安全可见性：响应中不得出现密钥（密钥不经过本页面，全走 backend 代理）

## Binding Constraints

- 侧栏+详情布局；760px 断点以下改纵向并允许滚动（这是本窗口断点，不是全局断点）
- 部分字段沿用紧凑内距（compact-x/y），不误用共享默认值
- 切换后需真实生效于下一轮问答，UI 即时反馈与后端状态一致
