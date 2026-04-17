# ASR WebSocket 流式协议

## 端点

```
ws://localhost:7191/api/v1/asr/stream/vad?model_id=<model_id>
```

## 双端消息协议

### 客户端 → 服务端

#### 1. prepare - 准备阶段
准备录音会话，加载模型和 VAD。

```json
{"type": "prepare"}
```

**服务端响应：**
```json
{"type": "prepared", "message": "模型加载成功，VAD 已就绪"}
```
或错误：
```json
{"type": "error", "error": "vad_init_failed", "message": "VAD 初始化失败"}
```

---

#### 2. start - 开始录音
开始服务端麦克风录音。

```json
{
  "type": "start",
  "save_audio": true
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `save_audio` | boolean | false | 是否保存完整录音文件 |

**服务端响应：**
```json
{
  "type": "started",
  "session_id": "7ed104bc-d174-496d-a2c2-267be2dafaca",
  "sample_rate": 16000,
  "record_dir": "/var/folders/.../vad_recording_xxx"
}
```

---

#### 3. stop - 停止录音
停止录音并返回结果。

```json
{"type": "stop"}
```

**服务端响应：**
```json
{
  "type": "stopped",
  "session_id": "7ed104bc-d174-496d-a2c2-267be2dafaca",
  "segments": 2,
  "total_duration": 116.0,
  "full_recording": "/var/folders/.../full_recording_xxx.wav",
  "text": "能听见我说话吗？嗯，是这样的..."
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `session_id` | string | 会话 ID |
| `segments` | number | 语音段落数量 |
| `total_duration` | number | 总录音时长（秒） |
| `full_recording` | string/null | 完整录音文件路径（仅当 save_audio=true 时） |
| `text` | string | 所有段落识别文本的汇总 |

---

### 服务端 → 客户端（服务端事件）

#### 4. prepared - 准备完成
```json
{"type": "prepared", "message": "模型加载成功，VAD 已就绪"}
```

#### 5. started - 录音开始
```json
{
  "type": "started",
  "session_id": "xxx",
  "sample_rate": 16000,
  "record_dir": "/path/to/record_dir"
}
```

#### 6. vad_start - 检测到说话开始
```json
{
  "type": "vad_start",
  "session_id": "xxx",
  "segment_id": "fce25d29",
  "start_time": 13.8
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `segment_id` | string | 段落 ID（8位） |
| `start_time` | number | 开始时间（秒） |

#### 7. segment_ready - 段落识别完成
```json
{
  "type": "segment_ready",
  "session_id": "xxx",
  "segment_id": "fce25d29",
  "file_path": "/path/to/segment_fce25d29.wav",
  "start_time": 13.8,
  "end_time": 16.4,
  "duration": 2.6,
  "text": "/sil"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `segment_id` | string | 段落 ID |
| `file_path` | string | 音频片段文件路径 |
| `start_time` | number | 开始时间（秒） |
| `end_time` | number | 结束时间（秒） |
| `duration` | number | 持续时间（秒） |
| `text` | string | 识别文本（`/sil` 表示静音或无语音） |

#### 8. vad_end - 说话结束
```json
{
  "type": "vad_end",
  "session_id": "xxx",
  "segment_id": "fce25d29",
  "segments_count": 1
}
```

#### 9. stopped - 录音停止
```json
{
  "type": "stopped",
  "session_id": "xxx",
  "segments": 2,
  "total_duration": 116.0,
  "full_recording": "/path/to/full_recording.wav",
  "text": "能听见我说话吗？嗯，是这样的..."
}
```

#### 10. closed - 连接关闭
```json
{"type": "closed"}
```

#### 11. error - 错误
```json
{"type": "error", "error": "busy", "message": "Another recording is in progress"}
```

---

## 完整交互示例

```
客户端                          服务端
   |                              |
   |====== connect ==============>|
   |                              |
   |----- {"type":"prepare"} ---->|
   |<---- {"type":"prepared"} ----|  模型加载成功
   |                              |
   |----- {"type":"start", ----->|
   |      "save_audio": true}     |
   |                              |
   |<---- {"type":"started"} ------|  开始录音
   |                              |
   |<==== 说话中... ===============|
   |                              |
   |<---- {"type":"vad_start"} ---|  检测到语音开始
   |<---- {"type":"segment_ready"}-|  语音段落识别完成
   |<---- {"type":"vad_end"} ------|  检测到语音结束
   |                              |
   |<==== 说话中... ===============|
   |                              |
   |<---- {"type":"vad_start"} ---|
   |<---- {"type":"segment_ready"}-|  第二段识别
   |<---- {"type":"vad_end"} ------|
   |                              |
   |----- {"type":"stop"} ------->|
   |<---- {"type":"stopped"} ------|  返回完整结果
   |<---- {"type":"closed"} ------|  连接关闭
   |                              |
```

---

## 注意事项

### 1. 互斥性
同一时刻只能有一个录音会话在运行。第二个客户端尝试连接时会收到 `busy` 错误并被断开。

### 2. save_audio
设置为 `true` 时，停止后会保存完整录音为 WAV 文件，路径在 `full_recording` 字段返回。文件位于临时目录，系统会在适当时候清理。

### 3. 录音中断处理
如果在 `vad_start` 和 `vad_end` 之间发送 `stop`，服务会等待当前语音说完再保存完整片段。

### 4. 文本 `/sil`
当 VAD 检测到的段落无有效语音内容时，识别文本会返回 `/sil`（表示静音段）。

---

## 测试命令

```bash
# 连接
wscat -c "ws://localhost:7191/api/v1/asr/stream/vad?model_id=funasr-nano"

# 准备
{"type": "prepare"}

# 开始录音（保存完整音频）
{"type": "start", "save_audio": true}

# 停止
{"type": "stop"}
```
