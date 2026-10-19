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
