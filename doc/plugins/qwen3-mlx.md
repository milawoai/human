# Human 首个真实 installed 插件：Qwen3-MLX TTS

落地日期：2026-10-19。跟踪事项：`human-ylm`，来源：`human-op5`。

## 安装位置与边界

源码：`/Users/zhou/Desktop/human-tools/tts/qwen3-mlx`，不放在 monorepo。

- npm 包：`human-tts-qwen3-mlx@0.1.0`，providerId：`qwen3-mlx`。
- 插件入口：`index.js`，以本地目录软链接安装到 `~/.ai_secretary/plugins/node_modules/human-tts-qwen3-mlx`。
- 声明：源码中的 `config/qwen3-mlx.json`；运行配置：`~/.ai_secretary/tools/tools/qwen3-mlx.json`。
- 类别：`tts@1.0`，origin：`installed`，执行方式：`builtin`（仅 JS provider 在宿主内，模型在独立 Python worker）。
- 实现：`tts.synthesize`、`tts.voices.list`；没有冒充 async clone/job 能力。

宿主依靠已有的插件解析、契约校验和 `/tts-cache` 即可使用。此插件没有引入任何 Qwen 专属宿主业务代码或 backend dependency。

详细使用说明见工程外的 `PLUGIN.md`；原 `README.md` 保留 CLI 使用方式并链接插件说明。当前本地插件源码独立保存，不属于 Human Git 仓库。

## 调用示例

启动 Human 后端后：

```bash
curl -sS --max-time 190 http://127.0.0.1:12002/neural/trigger \
  -H 'Content-Type: application/json' \
  -d '{"kind":"command","topic":"motor.tool.execute","payload":{"tool":"qwen3-mlx","capability":"tts.synthesize","parameters":{"text":"你好，这是 Human 的第一个语音插件。","voiceId":"Serena","format":"wav"}}}'
```

克隆音色使用 `voiceId: "clone:my-voice"`；素材在插件目录的 `voices/my-voice/reference.wav` 和 `reference.txt`。用 `tts.voices.list` 获取当前音色，不在 Brain 中维护引擎音色枚举。

插件负责合成并返回 Body 可访问的 HTTP URL，Brain 的自动回复播报与 Body 播放编排不在本次实现中。

## 验证与样本

```bash
cd /Users/zhou/Desktop/human-tools/tts/qwen3-mlx
npm test
npm run test:python
npm run verify:human
```

验收脚本经真实 Neural HTTP 调用及契约执行器验证类别发现、预设合成、克隆合成、MP3、变速、音频 HTTP 200/CORS/有效字节、非法参数拒绝和常驻 worker 复用。样本与报告保存在 `output/plugin-verification/`，不随插件包分发。

首次纪念语句的测试样本名：`first-plugin.wav`；克隆样本：`my-voice.wav`。它们是实际模型输出，未用 mock 替代；音质与相似度仍由用户试听评估。

本地源码归档：插件目录 `output/human-tts-qwen3-mlx-0.1.0.tgz`，npm SHA-1 `6331b0c466b678f2610df2b4099e3f7f0354ab4b`。打包清单只包含 provider、worker、engine、manifest、脚本和说明，不含 .venv、模型、录音、voices 或验收音频。

首次验收结果：4 项 Node 测试、7 项 Python 测试、宿主 verify:contracts 及真实端到端验证通过。第一次预设合成（含加载）约 4.5 秒；后续短句约 0.5–1.2 秒，仅代表本机这组短文本。测试后端与 worker 已停止，正常启动 Human 后将按已登记配置自动加载插件。

## 运行约定

worker 私有 stdin/stdout JSON-lines 通信，不另开 HTTP 端口。模型、参考音频与上游参考编码在进程内复用。缓存不代表训练后的新音色模型，也不保证消除上游所有 speaker 特征计算。新文本始终需要推理。

默认单请求超时 180 秒，队列最多 16；超时/取消终止当前 worker，同 worker 排队请求也会失败，下一次调用重启。音频保存在宿主 TTS 缓存，按 24 小时、256 个、512MiB 的边界清理本插件文件。参考素材不参与清理。

重新登记运行 `npm run install:human`，会保存配置备份、保留已有 enabled 与 runtime config。随后重载后端。停用时修改工具索引的 enabled 并重载，不删除素材。重装时须保留本地 Python 环境，参见插件 README。
