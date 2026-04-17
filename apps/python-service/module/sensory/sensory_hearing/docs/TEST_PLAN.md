# Speech Recognition 模块测试文档

## 测试环境

- **Python**: 3.13.5
- **平台**: macOS (Apple Silicon)
- **设备**: MPS (Metal Performance Shaders)
- **模型路径**:
  - Qwen3-ASR: `/Users/zhou/Downloads/model/asr/Qwen3-ASR-1.7B`
  - Qwen3-ForcedAligner: `/Users/zhou/Downloads/model/asr/Qwen3-ForcedAligner-0.6B`

---

## 1. 单元测试

### 1.1 模块导入测试

```python
# test_imports.py
def test_module_imports():
    """测试所有模块是否可以正确导入"""
    from features.speech_recognition import (
        ASRServiceFactory,
        ASRModelConfig,
        ASRModelType,
        BaseASRService,
        FunAsrService,
        Qwen3ASRService,
        get_config,
        create_service,
        SpeechRecognitionController,
        LoadModelRequest,
    )
    assert ASRModelType.FUNASR.value == "funasr"
    assert ASRModelType.QWEN3.value == "qwen3"
    print("✅ 模块导入测试通过")
```

### 1.2 工厂类测试

```python
# test_factory.py
def test_factory_supported_models():
    """测试工厂类支持的模型"""
    from features.speech_recognition import ASRServiceFactory

    models = ASRServiceFactory.get_supported_models()
    assert "funasr" in models
    assert "qwen3" in models
    print(f"✅ 支持的模型: {models}")

def test_factory_create_funasr():
    """测试创建 FunASR 服务"""
    from features.speech_recognition import ASRServiceFactory, ASRModelType

    service = ASRServiceFactory.create_service(ASRModelType.FUNASR)
    assert service.model_type.value == "funasr"
    assert service.model_loaded == False
    print("✅ FunASR 服务创建成功")

def test_factory_create_qwen3():
    """测试创建 Qwen3 服务"""
    from features.speech_recognition import ASRServiceFactory, ASRModelType

    service = ASRServiceFactory.create_service(ASRModelType.QWEN3)
    assert service.model_type.value == "qwen3"
    assert service.use_vllm == False  # macOS 默认不使用 vLLM
    print("✅ Qwen3 服务创建成功 (transformers 后端)")

def test_factory_parse_model_type():
    """测试模型类型解析"""
    from features.speech_recognition import ASRServiceFactory, ASRModelType

    assert ASRServiceFactory.parse_model_type("funasr") == ASRModelType.FUNASR
    assert ASRServiceFactory.parse_model_type("qwen3") == ASRModelType.QWEN3
    assert ASRServiceFactory.parse_model_type("QWEN3") == ASRModelType.QWEN3
    assert ASRServiceFactory.parse_model_type("qwen") == ASRModelType.QWEN3
    assert ASRServiceFactory.parse_model_type("paraformer") == ASRModelType.FUNASR
    print("✅ 模型类型解析测试通过")
```

### 1.3 配置测试

```python
# test_config.py
def test_config_from_env():
    """测试从环境变量加载配置"""
    from features.speech_recognition import ASRServiceConfig

    config = ASRServiceConfig.from_env()
    assert config.sample_rate == 16000
    assert config.default_model_type == "funasr"
    print(f"✅ 配置加载成功: {config}")
```

### 1.4 平台检测测试

```python
# test_platform.py
def test_platform_detection():
    """测试平台检测"""
    from features.speech_recognition.impl.qwen3_service import (
        _is_macos,
        _is_apple_silicon,
        _should_use_vllm,
    )

    print(f"macOS: {_is_macos()}")
    print(f"Apple Silicon: {_is_apple_silicon()}")
    print(f"使用 vLLM: {_should_use_vllm()}")

    if _is_macos():
        assert _should_use_vllm() == False, "macOS 应该使用 transformers 后端"

    print("✅ 平台检测测试通过")
```

---

## 2. 集成测试

### 2.1 模型加载测试

```python
# test_model_loading.py
import asyncio

async def test_qwen3_model_loading():
    """测试 Qwen3 模型加载"""
    from features.speech_recognition import Qwen3ASRService, ASRModelConfig

    config = ASRModelConfig(
        model_path="/Users/zhou/Downloads/model/asr/Qwen3-ASR-1.7B",
        aligner_path="/Users/zhou/Downloads/model/asr/Qwen3-ForcedAligner-0.6B",
        device="mps",
        dtype="bfloat16",
    )

    service = Qwen3ASRService(config=config)

    # 检查初始状态
    status = service.get_status()
    print(f"初始状态: {status}")
    assert status["model_loaded"] == False

    # 加载模型
    await service.load_model()

    # 检查加载后状态
    status = service.get_status()
    print(f"加载后状态: {status}")
    assert status["model_loaded"] == True
    assert status["backend"] == "transformers"

    print("✅ Qwen3 模型加载测试通过")

# 运行测试
# asyncio.run(test_qwen3_model_loading())
```

### 2.2 文件转录测试

```python
# test_file_transcription.py
import asyncio

async def test_qwen3_file_transcription():
    """测试 Qwen3 文件转录"""
    from features.speech_recognition import Qwen3ASRService, ASRModelConfig

    config = ASRModelConfig(
        model_path="/Users/zhou/Downloads/model/asr/Qwen3-ASR-1.7B",
        device="mps",
        dtype="bfloat16",
    )

    service = Qwen3ASRService(config=config)
    await service.load_model()

    # 测试转录 (需要一个测试音频文件)
    # result = await service.transcribe_file("/path/to/test.wav")
    # print(f"转录结果: {result}")
    # assert result["success"] == True
    # assert len(result["text"]) > 0

    print("⚠️ 需要提供测试音频文件")

# asyncio.run(test_qwen3_file_transcription())
```

---

## 3. API 测试

### 3.1 HTTP API 测试

启动服务后执行：

```bash
# 3.1.1 获取支持的模型列表
curl -X GET "http://localhost:7191/api/v1/speech/models" | jq

# 预期输出:
# {
#   "success": true,
#   "data": {
#     "funasr": "paraformer-zh-streaming",
#     "qwen3": "Qwen/Qwen3-ASR-1.7B"
#   }
# }

# 3.1.2 加载 Qwen3 模型
curl -X POST "http://localhost:7191/api/v1/speech/load-model" \
  -H "Content-Type: application/json" \
  -d '{
    "model_type": "qwen3",
    "model_path": "/Users/zhou/Downloads/model/asr/Qwen3-ASR-1.7B",
    "aligner_path": "/Users/zhou/Downloads/model/asr/Qwen3-ForcedAligner-0.6B"
  }' | jq

# 预期输出:
# {
#   "success": true,
#   "data": {
#     "model_type": "qwen3",
#     "model_name": "/Users/zhou/Downloads/model/asr/Qwen3-ASR-1.7B",
#     "loaded": true,
#     "status": { ... }
#   },
#   "msg": "模型加载成功"
# }

# 3.1.3 获取服务状态
curl -X GET "http://localhost:7191/api/v1/speech/status?model_type=qwen3" | jq

# 预期输出:
# {
#   "success": true,
#   "data": {
#     "model_type": "qwen3",
#     "model_loaded": true,
#     "model_name": "...",
#     "backend": "transformers",
#     "platform": "Darwin",
#     "is_apple_silicon": true,
#     "active_sessions": 0
#   }
# }

# 3.1.4 加载 FunASR 模型 (默认)
curl -X POST "http://localhost:7191/api/v1/speech/load-model" \
  -H "Content-Type: application/json" \
  -d '{
    "model_type": "funasr"
  }' | jq

# 3.1.5 转录音频文件
curl -X POST "http://localhost:7191/api/v1/speech/transcribe/file?model_type=qwen3&language=Chinese" \
  -F "audio_file=@/path/to/test.wav" | jq
```

### 3.2 WebSocket API 测试

```python
# test_websocket.py
import asyncio
import websockets
import json

async def test_websocket_qwen3():
    """测试 WebSocket 流式识别 (Qwen3)"""

    uri = "ws://localhost:7191/api/v1/speech/recognize"

    async with websockets.connect(uri) as ws:
        # 1. 发送配置
        config = {
            "mode": "2pass",
            "wav_name": "test_session",
            "model_type": "qwen3",
            "model_path": "/Users/zhou/Downloads/model/asr/Qwen3-ASR-1.7B",
            "language": "Chinese"
        }
        await ws.send(json.dumps(config))

        # 2. 等待 ready 消息
        ready_msg = await ws.recv()
        print(f"Ready: {ready_msg}")

        # 3. 发送音频数据 (需要实际音频数据)
        # with open("/path/to/test.pcm", "rb") as f:
        #     audio_data = f.read()
        #     await ws.send(audio_data)

        # 4. 接收识别结果
        # result = await ws.recv()
        # print(f"Result: {result}")

        # 5. 发送结束信号
        await ws.send(json.dumps({"is_speaking": False}))

        # 6. 接收最终结果
        final_result = await ws.recv()
        print(f"Final: {final_result}")

# asyncio.run(test_websocket_qwen3())
```

---

## 4. 性能测试

### 4.1 模型加载时间

```python
# test_performance.py
import asyncio
import time

async def test_load_time():
    """测试模型加载时间"""
    from features.speech_recognition import Qwen3ASRService, ASRModelConfig

    config = ASRModelConfig(
        model_path="/Users/zhou/Downloads/model/asr/Qwen3-ASR-1.7B",
        device="mps",
        dtype="bfloat16",
    )

    service = Qwen3ASRService(config=config)

    start = time.time()
    await service.load_model()
    load_time = time.time() - start

    print(f"模型加载时间: {load_time:.2f}秒")

    # 预期: 首次加载 < 60秒, 后续加载 < 5秒 (如果已缓存)
    assert load_time < 120, "加载时间过长"

    print("✅ 模型加载时间测试通过")

# asyncio.run(test_load_time())
```

### 4.2 转录延迟测试

```python
async def test_transcription_latency():
    """测试转录延迟"""
    from features.speech_recognition import Qwen3ASRService, ASRModelConfig
    import numpy as np

    config = ASRModelConfig(
        model_path="/Users/zhou/Downloads/model/asr/Qwen3-ASR-1.7B",
        device="mps",
        dtype="bfloat16",
    )

    service = Qwen3ASRService(config=config)
    await service.load_model()

    # 生成测试音频 (1秒静音)
    sample_rate = 16000
    duration = 1.0
    silence = np.zeros(int(sample_rate * duration), dtype=np.int16)
    audio_bytes = silence.tobytes()

    # 测试多次转录
    latencies = []
    for i in range(5):
        start = time.time()
        result = await service.transcribe_chunk(audio_bytes, {"wav_name": f"test_{i}"})
        latency = time.time() - start
        latencies.append(latency)
        print(f"转录 {i+1}: {latency*1000:.2f}ms")

    avg_latency = sum(latencies) / len(latencies)
    print(f"平均延迟: {avg_latency*1000:.2f}ms")

    # 预期: 延迟 < 500ms
    assert avg_latency < 1.0, "延迟过高"

    print("✅ 转录延迟测试通过")

# asyncio.run(test_transcription_latency())
```

---

## 5. 测试检查清单

### 基础功能

- [ ] 模块可以正确导入
- [ ] 工厂类可以创建 FunASR 服务
- [ ] 工厂类可以创建 Qwen3 服务
- [ ] 配置可以从环境变量加载
- [ ] macOS 平台检测正确
- [ ] 后端自动选择正确 (macOS → transformers)

### 模型加载

- [ ] FunASR 模型可以加载
- [ ] Qwen3 模型可以加载 (本地路径)
- [ ] 模型状态正确更新
- [ ] 错误处理正确

### 转录功能

- [ ] FunASR 文件转录正常
- [ ] Qwen3 文件转录正常
- [ ] 语言检测正常 (Qwen3)
- [ ] 时间戳返回正常 (可选)

### API 测试

- [ ] GET /models 返回正确
- [ ] POST /load-model 正常
- [ ] GET /status 返回正确
- [ ] POST /transcribe/file 正常
- [ ] WebSocket 流式识别正常

### 性能测试

- [ ] 模型加载时间可接受
- [ ] 转录延迟可接受
- [ ] 内存使用正常

---

## 6. 测试命令汇总

```bash
# 运行所有单元测试
cd /Users/zhou/Desktop/code/1/AutoCoding/apps/python-service
python -m pytest features/speech_recognition/tests/ -v

# 运行单个测试文件
python -m pytest features/speech_recognition/tests/test_factory.py -v

# 运行带覆盖率
python -m pytest features/speech_recognition/tests/ --cov=features/speech_recognition -v

# 手动测试 API
curl -X GET "http://localhost:7191/api/v1/speech/models" | jq
```

---

## 7. 已知问题

1. **vLLM 在 macOS 不支持**: 自动降级到 transformers 后端
2. **首次模型加载较慢**: 约 20-30 秒，后续加载会使用缓存
3. **nagisa 包警告**: `SyntaxWarning: invalid escape sequence` (可忽略)

---

## 8. 测试音频准备

需要准备以下测试音频：

```bash
# 使用 ffmpeg 生成测试音频
# 16kHz, 16-bit, mono PCM

# 中文测试
ffmpeg -i chinese_test.mp3 -ar 16000 -ac 1 -acodec pcm_s16le chinese_test.pcm

# 英文测试
ffmpeg -i english_test.mp3 -ar 16000 -ac 1 -acodec pcm_s16le english_test.pcm
```

---

## 9. 下一步

1. 创建 `features/speech_recognition/tests/` 目录
2. 添加 pytest 配置
3. 实现自动化测试
4. 添加 CI/CD 集成
