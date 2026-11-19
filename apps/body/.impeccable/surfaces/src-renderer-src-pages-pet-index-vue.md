---
version: 1
slug: "src-renderer-src-pages-pet-index-vue"
primary_target: "src/renderer/src/pages/pet/index.vue"
related_targets: []
---

# 桌宠窗口（pet）

## Mode

Experience

## Surface Purpose

Live2D 伙伴的形体所在：透明外画布上常驻桌面的「伙伴本体」，TTS 播报浮层与口型同步是仅有的 UI。界面退后，角色是主体。

## Primary Jobs

- 常驻陪伴存在感：不要求用户操作，任何 UI 元素都应可忽略
- TTS 播报入口与字幕浮层（pet-tts-launcher / pet-tts-overlay）：短暂出现、及时消失

## Binding Constraints

- 外画布保持透明（主题不染画布本身）；浮层内容卡片按当前主题着色
- Live2D 画布不加普通页面内距；画布几何与模型内容不属于语义间距
- 主题/字号跟随全局 `theme-set` IPC，不得本窗口私切
