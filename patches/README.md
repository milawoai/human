# Body Live2D TTS 测试入口

`body-live2d-tts-test.patch` 保存 2026-10-19 的 6 个 Body 文件改动：固定语音测试按钮、文本确认弹框、声明式 IPC、按类别发现插件、播放与 CORS 口型支持及调用链测试。

当前父仓库的 `apps/body` 是 gitlink（160000），但工作目录没有子仓库 `.git`，父仓库也没有 `.gitmodules` 映射；普通父仓库提交不会记录 Body 内文件。本次只保留改动补丁，不改变既有子模块结构。本机源码已应用并构建验证。

在本次修改前的 Body 文件版本上，从 Human 根目录应用：

```bash
git apply --check patches/body-live2d-tts-test.patch
git apply patches/body-live2d-tts-test.patch
```

若本机已应用，可用反向检查确认，不必再次应用：

```bash
git apply --reverse --check patches/body-live2d-tts-test.patch
```

验证：

```bash
yarn workspace electron_with_serve test:tts
yarn workspace electron_with_serve typecheck
yarn workspace electron_with_serve build:no-lint
```

Electron 实测已通过：点击按钮、输入框自动聚焦、确认后真实插件生成、音频播放进度推进、非零 WebAudio 口型信号，以及空输入禁用与取消。正常启动后，Live2D 窗口右上角“语音测试”即可使用；需同时运行 Human 后端并启用 TTS 插件。

## Agent 测试入口（2026-10-21）

`body-agent-test-panel.patch` 是在已应用上述 TTS 改动的 Body 上生成的增量补丁，涉及 10 个文件。当前本机已应用；不要重复应用。父仓库另有配套 backend 改动，增加 `toolPreset: "none"`，部署时必须一起更新。

```bash
git apply --reverse --check patches/body-agent-test-panel.patch
# 仅在尚未应用的对应 Body 基线上：
git apply --check patches/body-agent-test-panel.patch
git apply patches/body-agent-test-panel.patch
```

使用：启动后端及 Electron，点击 Live2D 右上方的 **Agent 测试**。独立窗口直接接入 `brain.agent.run`，原 AI 会话仍走 Cortex，不改变语音提问链路。

- 输入任务后点击发送，支持 Ctrl/⌘ + Enter。profile 留空使用后端默认模型，也可以输入已有 profile 名。
- 默认不提供工具。明确选择“全部已注册工具”或“编码与会话工具”后，模型才可调用对应工具；这些工具可能写文件或运行命令，不是只读沙箱。
- 支持流式回答、模型返回的思考内容、工具参数/进度/结果，以及新建和恢复最近 50 个会话。历史工具结果作为消息显示，本轮工具进度单独展示。
- 当前仍用 pi-agent-core。没有取消接口、执行超时后的可靠恢复或 Durable 迁移。运行时不允许切换会话或关闭测试窗口。HTTP 请求中断不表示后端任务一定停止，请勿盲目重试。
- 每轮单独建立一个 Neural 观察连接，确认订阅后才发起任务，只转发对应会话和运行 ID 的事件，结束/失败后释放连接。不会复用或覆盖 hearing 的订阅。

验证命令：

```bash
yarn workspace electron_with_serve test:agent
yarn workspace electron_with_serve test:tts
yarn workspace electron_with_serve typecheck
yarn workspace backend verify:agent-panel
yarn workspace backend typecheck
yarn workspace backend build
yarn workspace electron_with_serve build:no-lint
```

`verify:agent-panel` 使用实际安装的 Pi Agent，注入确定性模型流和无副作用内存工具，验证 model→tool→model、运行事件、会话保存及无工具模式，不请求付费模型。

桌面端到端脚本 `node scripts/verify-agent-panel.cjs` 需要 Electron 以 `--remote-debugging-port=19222 --remote-debugging-address=127.0.0.1` 启动。它会通过实际按钮和 IPC，向默认模型发送两轮无工具测试消息，验证会话记忆、恢复、重复提交锁定及无效 profile 错误恢复，并保存截图至 `/private/tmp/human-agent-panel.png`。运行可能产生模型调用费用。验收后应关闭调试实例，正常重启 Electron。

补丁生成器 `scripts/archive-body-agent-patch.cjs` 只用于对照本次修改前保留的四个文件生成机械差异；它不是插件安装器。Body 子仓库元数据问题继续由 `human-ryp` 跟踪。
