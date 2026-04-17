# Sherpa-ONNX ASR 服务开发指南

## 概述

本模块提供基于 Sherpa-ONNX 的语音识别服务，支持多种 ASR 模型和两种流式识别模式。

### 已支持的模型

| 模型 ID | 类型 | 说明 |
|---------|------|------|
| `funasr-nano` | FunASR-Nano FP32 | 基础版本 |
| `funasr-nano-fp16` | FunASR-Nano FP16 | 半精度版本，推理更快 |
| `funasr-nano-int8` | FunASR-Nano INT8 | 量化版本，占用更小 |

### 核心能力

| 能力 | 说明 |
|------|------|
| **离线转录** | 上传音频文件，获取完整文本 |
| **伪流式识别** | VAD + Offline ASR，检测说话结束后返回文本 |
| **真流式识别** | Online ASR，边说边出字（需要支持流式的模型） |
| **服务端录音** | WebSocket 模式下由服务端采集麦克风音频 |

---

## 架构设计

### 服务分类体系

```
ASRServiceCategory (base.py)
├── SHERPA_ONNX_FUNASR    # Sherpa-ONNX FunASR 系列
├── SHERPA_ONNX_WHISPER   # Sherpa-ONNX Whisper 系列
├── SHERPA_ONNX_SENSE_VOICE # Sherpa-ONNX SenseVoice 系列
└── SHERPA_ONNX_PARAFORMER # Sherpa-ONNX Paraformer 系列
```

### 服务实现

| 文件 | 负责模型 |
|------|---------|
| `impl/sherpa_onnx_funasr_service.py` | Sherpa-ONNX FunASR-Nano、SenseVoice 等 |
| `impl/sherpa_onnx_service.py` | 通用 Sherpa-ONNX 模型（备用） |

### 目录结构

```
features/speech_recognition/
├── __init__.py
├── base.py              # 基类、枚举定义
├── config.py            # 配置管理、模型注册表
├── factory.py           # 服务工厂
├── models.py           # 模型定义
├── controllers.py      # API 控制器
├── recorder.py         # 录音管理（legacy）
├── streaming_session.py # 流式会话状态机
├── vad_recording_session.py  # VAD 录音会话
└── impl/               # 服务实现
    ├── __init__.py
    ├── sherpa_onnx_service.py
    └── sherpa_onnx_funasr_service.py
```

---

## API 接口

### 基础信息

- **Base URL**: `http://localhost:7191/api/v1/asr`
- **WebSocket Base**: `ws://localhost:7191/api/v1/asr`

### REST API

#### 1. 获取支持的模型列表

```bash
GET /models
```

**响应：**
```json
{
  "success": true,
  "total": 3,
  "models": [
    {"id": "funasr-nano", "category": "sherpa-onnx-funasr"},
    {"id": "funasr-nano-fp16", "category": "sherpa-onnx-funasr"},
    {"id": "funasr-nano-int8", "category": "sherpa-onnx-funasr"}
  ]
}
```

#### 2. 离线文件转录

```bash
POST /transcribe?model_id=funasr-nano
Content-Type: multipart/form-data

file: <audio.wav>
```

**响应：**
```json
{
  "success": true,
  "text": "识别的文本内容"
}
```

#### 3. 获取服务状态

```bash
GET /status
```

---

## WebSocket 接口

### 端点 1: `/stream` (客户端发送音频)

**URL**: `ws://localhost:7191/api/v1/asr/stream?model_id=funasr-nano`

适用于客户端自行采集音频并发送的场景。

#### 消息协议

**客户端 → 服务端：**
```json
{"type": "start", "mode": "segment"}
{"type": "audio", "data": "<base64_pcm_data>"}
{"type": "stop"}
```

**服务端 → 客户端：**
```json
{"type": "started", "session_id": "xxx", "mode": "segment"}
{"type": "vad_start"}
{"type": "vad_end"}
{"type": "final", "text": "识别结果"}
{"type": "stopped"}
```

---

### 端点 2: `/stream/vad` (服务端录音)

**URL**: `ws://localhost:7191/api/v1/asr/stream/vad?model_id=funasr-nano&subtitle_mode=true&save_dir=/path/to/save`

适用于服务端直接采集麦克风音频的场景。

#### URL 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model_id` | string | `funasr-nano` | 使用的模型 ID |
| `subtitle_mode` | boolean | `true` | `true`=VAD模式（实时字幕），`false`=简单录音模式 |
| `save_dir` | string | `null` | 录音保存目录，不指定则保存到临时目录 |

#### 消息协议

**流程（subtitle_mode=true）：**
```
客户端                    服务端
  │                         │
  │─────── prepare ────────>│  加载模型、初始化 VAD
  │<────── prepared ─────────│
  │                         │
  │─────── start ──────────>│  开始录音
  │<────── started ──────────│
  │                         │
  │<────── vad_start ───────│  检测到说话
  │<────── vad_end ──────────│  说话结束
  │<────── segment_ready ────│  包含文件路径和识别文本
  │                         │
  │       ... 重复 ...       │
  │                         │
  │─────── stop ───────────>│  停止录音
  │<────── stopped ──────────│  包含完整录音路径和文本
  │<────── closed ───────────│
```

**流程（subtitle_mode=false）：**
```
客户端                    服务端
  │                         │
  │─────── prepare ────────>│  初始化音频流
  │<────── prepared ─────────│
  │                         │
  │─────── start ──────────>│  开始录音
  │<────── started ──────────│
  │                         │
  │       ... 录音中 ...     │
  │                         │
  │─────── stop ───────────>│  停止录音
  │<────── stopped ──────────│  包含完整录音路径
  │<────── closed ───────────│
```

#### 客户端发送

```json
{"type": "prepare"}         // 准备阶段
{"type": "start"}          // 开始录音
{"type": "stop"}           // 停止录音
{"type": "heartbeat"}       // 心跳保活（每1秒发送）
```

#### 服务端返回

```json
{"type": "prepared"}
{"type": "started", "session_id": "xxx", "sample_rate": 16000, "record_dir": "/tmp/..."}
{"type": "vad_start", "segment_id": "xxx", "start_time": 0.0}  // subtitle_mode=true
{"type": "vad_end", "segment_id": "xxx"}                         // subtitle_mode=true
{"type": "segment_ready", "segment_id": "xxx", "file_path": "/tmp/...wav", "start_time": 0.0, "end_time": 1.5, "text": "识别文本"}  // subtitle_mode=true
{"type": "stopped", "segments_count": 3, "full_recording": "/path/to/recording.wav", "text": "完整文本", "total_duration": 60.5}
{"type": "closed"}
{"type": "error", "error": "heartbeat_timeout", "message": "No heartbeat received for 10.0 seconds"}  // 心跳超时
```

#### 心跳保活机制

- **客户端**：每 1 秒发送 `{"type": "heartbeat"}`
- **服务端**：如果 10 秒没收到心跳，自动停止录音并关闭连接
- **用途**：防止客户端崩溃后录音会话无法清理

---

## 配置管理

### 当前已注册模型

```python
# config.py _init_model_registry()
{
    "funasr-nano": ModelDefinition(
        model_path="/Users/zhou/Downloads/model/audio/onnx/funasr-nano",
        category=ASRServiceCategory.SHERPA_ONNX_FUNASR,
    ),
    "funasr-nano-fp16": ModelDefinition(
        model_path="/Users/zhou/Downloads/model/audio/onnx/funasr-nano-fp16",
        category=ASRServiceCategory.SHERPA_ONNX_FUNASR,
    ),
    "funasr-nano-int8": ModelDefinition(
        model_path="/Users/zhou/Downloads/model/audio/onnx/funasr-nano-int8",
        category=ASRServiceCategory.SHERPA_ONNX_FUNASR,
    ),
}
```

### 添加新模型

在 `config.py` 的 `_init_model_registry()` 中添加：

```python
"your-model-id": ModelDefinition(
    id="your-model-id",
    model_path="/path/to/your/model",
    can_streaming=False,
    engine="sherpa-onnx",
    category=ASRServiceCategory.SHERPA_ONNX_FUNASR,
),
```

---

## FunASR-Nano 系列模型

### 模型结构

```
funasr-nano/
├── encoder_adaptor.onnx      # 或 encoder_adaptor.int8.onnx
├── llm.fp32.onnx             # 或 llm.fp16.onnx / llm.int8.onnx
├── embedding.onnx            # 或 embedding.int8.onnx
└── Qwen3-0.6B/              # Tokenizer
```

### 量化版本说明

| 版本 | 文件后缀 | 特点 |
|------|----------|------|
| FP32 | `llm.fp32.onnx` | 精度最高，速度最慢 |
| FP16 | `llm.fp16.onnx` | 精度略有下降，推理更快 |
| INT8 | `llm.int8.onnx` | 量化压缩，占用最小 |

### 加载方式

自动检测文件后缀，优先使用量化版本：

```python
# SherpaOnnxFunasrService._load_offline_model() 会自动检测:
# - encoder_adaptor.onnx / encoder_adaptor.int8.onnx
# - llm.fp32.onnx / llm.fp16.onnx / llm.int8.onnx
# - embedding.onnx / embedding.int8.onnx
```

---

## 添加新 Sherpa-ONNX 模型

### 1. 确定模型类型

检查模型文件结构，确定使用哪种加载方式：

| 模型特征 | 加载方式 | 工厂方法 |
|----------|----------|----------|
| 有 `encoder_adaptor.onnx` + `llm.*.onnx` | FunASR-Nano | `from_funasr_nano()` |
| 有 `encoder.onnx` + `decoder.onnx` | Whisper | `from_whisper()` |
| 有 `model.onnx` (单文件) | SenseVoice | `from_sense_voice()` |
| 有 `*.onnx` (单文件) | Paraformer | `from_paraformer()` |

### 2. 更新加载逻辑

在 `SherpaOnnxFunasrService._load_offline_model()` 中添加检测分支：

```python
# 检测你的模型特征文件
your_model_marker = model_dir / "your_marker.onnx"

if your_model_marker.exists():
    self.offline_recognizer = sherpa_onnx.OfflineRecognizer.from_your_model(
        # 配置参数
    )
    return
```

### 3. 注册模型

在 `config.py` 中添加模型配置。

### 4. 测试

```bash
# 查看模型是否注册
curl "http://localhost:7191/api/v1/asr/models"

# 测试转录
curl -X POST "http://localhost:7191/api/v1/asr/transcribe?model_id=your-model" \
  -F "file=@test.wav"
```

---

## VAD 配置

### VAD 模型路径

```
/Users/zhou/Downloads/model/audio/onnx/silero_vad.onnx
```

可通过环境变量覆盖：
```bash
export SHERPA_VAD_MODEL=/path/to/your/vad.onnx
```

### VAD 参数

| 参数 | 说明 | 推荐值 |
|------|------|-------|
| `min_silence_duration` | 静音多久认为说完 | 0.5-1.0 秒 |
| `sample_rate` | 采样率 | 16000 |

---

## 测试命令

### 快速测试

```bash
# 1. 启动服务
cd apps/python-service && python main.py

# 2. 测试 REST API
curl "http://localhost:7191/api/v1/asr/models"
curl -X POST "http://localhost:7191/api/v1/asr/transcribe?model_id=funasr-nano-fp16" \
  -F "file=@/path/to/test.wav"
```

### WebSocket 测试

```bash
# 安装 wscat
npm install -g wscat

# 服务端录音模式
wscat -c "ws://localhost:7191/api/v1/asr/stream/vad?model_id=funasr-nano"
# 发送: {"type": "prepare"}
# 发送: {"type": "start"}
```

---

## 已知限制

1. **FunASR-Nano 音频长度**：单次识别限制 512 tokens，超长音频会截断
2. **VAD 模型**：需要预先下载 silero_vad.onnx
3. **服务端录音**：只支持单会话

---

## 相关文档

- [Sherpa-ONNX 官方文档](https://k2-fsa.github.io/sherpa/onnx/)
- [FunASR 模型下载](https://modelscope.cn/models)
- [Silero VAD](https://github.com/snakers4/silero-vad)
