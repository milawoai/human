# Human Python Service

FastAPI 服务，端口 12003。

## 开发

```bash
# 创建虚拟环境并安装依赖
uv sync

# 启动开发服务
uv run uvicorn main:app --host 0.0.0.0 --port 12003 --reload
```

## Sensory Hearing

ASR 语音识别逻辑位于 `module/sensory/sensory_hearing`，服务启动后挂载在 `/api/v1/asr`。

常用接口：

```bash
curl http://localhost:12003/api/v1/asr/models
curl http://localhost:12003/api/v1/asr/status
```

默认模型路径通过环境变量配置：

```bash
AUDIO_MODEL_ROOT=/Users/zhou/Downloads/model/audio/onnx
ASR_DEFAULT_MODEL=sherpa-onnx
ASR_SAMPLE_RATE=16000
ASR_DEVICE=cpu
```
