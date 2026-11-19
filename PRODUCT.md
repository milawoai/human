# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- 现在：产品作者本人的日常桌面秘书——个人工具优先，按真实个人工作流驱动演进。
- 未来：保留分发给技术用户的可能性；不为分发牺牲本地体验，但架构决策（插件体系、配置分层）不关闭这扇门。

## Product Purpose

Human（数字化秘书）是一个能听、能想、能做、能说的桌面 AI 秘书：Live2D 桌宠常驻桌面，语音提问 → 本地 ASR → Brain 决策（LLM + 工具调用）→ 执行/回答 → TTS 播报与桌宠口型表现。成功 = 用户日常真实依赖它完成问答、记忆检索、工具执行与编码委派，而不是演示型原型。

## Positioning

四个必须长期坚持的差异化机制：

1. **本地模型优先** —— ASR / LLM / TTS / 工具路由默认跑本地模型（MLX / Ollama），隐私与离线可用是默认而非选项。
2. **插件化能力生态** —— 类别契约 + manifest 的工具/模型插件体系，能力可独立安装扩展（首个真实插件 qwen3-mlx）。
3. **陪伴型桌宠** —— Live2D 形体 + 语音对话 + 六生理系统叙事，是「伙伴」不是工具窗口。
4. **多代理委派** —— 把 claude / codex 等外部编码代理变成秘书的手，人机协同做事。

## Operating Context

- 单机桌面环境；Electron 是当前唯一产品入口（backend NestJS :12002 与 python-service 两个 Runtime 由桌面端托管拉起）。
- 配置与插件位于 `~/.ai_secretary/`（插件根目录、manifest、tts-cache 等）。
- 开发为 monorepo（turbo + yarn workspaces）：`yarn dev` 并行三端；样式门禁 `verify:theme*` 是构建的一部分。
- 开发流程依赖 Obsidian 文档库（七阶段文档链）与 bd/beads issue 跟踪。

## Capabilities and Constraints

- 已交付基线：语音问答主链路、TTS 插件化（同步播报 + 会话摘要播报）、工具决策路由（本地 Qwen3-1.7B + SQLite 错题本自进化）、桌面统一主题（五套预设跨窗口切换）。
- 硬约束：**本地优先是长期承诺**（云端模型为可选补充）；**六大生理系统命名**（Sensory / Neural / Brain / Motor / Body / Immune）与「Brain 决策 → Motor 执行 → 插件干活 → Brain 交接 → Body 表现」边界链是产品叙事的一部分，保留。
- 开放决策：跨平台（当前仅 macOS arm64）；对外分发形态；Immune（权限/审批/审计）规划中未实现。
- 术语以 Obsidian 文档库《名词字典》为准。

## Brand Commitments

- 名称：Human（中文「数字化秘书」，工程代号 human）；暂无对外品牌资产。
- 体验基调：DESIGN.md 已确认的「轻盈的桌面伙伴」——温和、亲近、轻巧；五套主题名称与各自强调色已经用户确认，不得擅改。

## Evidence on Hand

- 架构与状态：Obsidian 文档库（架构草案、六系统说明文档、`功能/README` 索引、名词字典）。
- 已交付功能的实现/测试/交付记录：文档库 `功能/完成/` 下四个功能文件夹。
- 无用户研究、无外部用户反馈、无市场数据——未来工作不得虚构这些。

## Product Principles

1. **本地优先**：能力默认在本机可用，云端是补充不是前提。
2. **伙伴而非工具**：表现层（Body）与决策层（Brain）分离，桌宠是产品的脸。
3. **插件优先于内置**：新能力先考虑类别契约与插件形态，避免宿主膨胀。
4. **单一状态源**：主题 tokens、Job 状态、Beads issue 各有唯一权威来源，不建第二套。
5. **个人现在、产品未来**：按真实个人工作流驱动演进，架构不关闭分发可能性。

## Accessibility & Inclusion

- 已建立：主题对比度门禁（`check-contrast`）、字号缩放（100% / 112.5% / 125% 与 rem 间距联动）、键盘焦点可见性为设计规则。
- 未定：具体 WCAG 级别承诺。
