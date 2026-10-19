# mock-tts-tool — P4 替换验证夹具

零依赖 mock TTS 插件（`origin: installed` 形态），按 `tts@1.0` 契约实现
`tts.synthesize`（生成真实可播的最小 WAV 落盘 `~/.ai_secretary/tts_cache`，
用宿主注入的 `context.publicBaseUrl` 拼 URL）与 `tts.voices.list`。
导出工厂形态 `{ create(): BuiltinToolProvider }`。

## 安装三步（验证「工程外安装，宿主零改动」）

```bash
# ① 拷贝包到插件根目录
mkdir -p ~/.ai_secretary/plugins/node_modules
cp -rf apps/backend/test-fixtures/mock-tts-tool ~/.ai_secretary/plugins/node_modules/

# ② 登记 manifest（tools/tools/mock-tts.json 内容如下）并在 index.json 加条目
#    { "id": "mock-tts", "name": "Mock TTS", "enabled": true,
#      "configFile": "tools/mock-tts.json" }

# ③ 重载生效（或重启 backend）
#    POST /neural/trigger {"kind":"command","topic":"motor.tool.reload"}
```

manifest（`~/.ai_secretary/tools/tools/mock-tts.json`）：

```json
{
  "id": "mock-tts",
  "name": "Mock TTS",
  "version": "0.1.0",
  "type": "builtin",
  "origin": "installed",
  "category": "tts",
  "contractVersion": "1.0",
  "providerModule": "mock-tts-tool",
  "capabilities": [
    {
      "name": "tts.synthesize",
      "description": "文本合成语音（mock：生成静音 WAV）",
      "parameters": {
        "text": { "type": "string", "required": true, "minLength": 1 },
        "voiceId": { "type": "string" },
        "speed": { "type": "number", "minimum": 0.25, "maximum": 4 },
        "format": { "type": "string", "enum": ["wav", "mp3"] }
      },
      "returns": {
        "audioUrl": { "type": "string", "required": true },
        "durationMs": { "type": "number" },
        "format": { "type": "string" }
      }
    },
    {
      "name": "tts.voices.list",
      "description": "列出可用音色",
      "parameters": {},
      "returns": { "voices": { "type": "array", "required": true } }
    }
  ],
  "config": {}
}
```

## 验证

```bash
# 按类别发现
curl -s -X POST http://127.0.0.1:12002/neural/trigger -H 'Content-Type: application/json' \
  -d '{"kind":"query","topic":"motor.tool.list","payload":{"category":"tts"}}'
# 执行合成 → 返回 audioUrl，GET 该 URL 应得 audio/wav
curl -s -X POST http://127.0.0.1:12002/neural/trigger -H 'Content-Type: application/json' \
  -d '{"kind":"command","topic":"motor.tool.execute","payload":{"tool":"mock-tts","capability":"tts.synthesize","parameters":{"text":"你好"}}}'
```
