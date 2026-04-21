"""
VAD Recording Session
服务端录音 + VAD 分段识别会话

流程:
1. 客户端开启长链
2. 服务端返回准备启动，并挂锁
3. 服务端返回加载模型成功
4. 服务端返回开始录音
5. VAD 检测开始说话 → 返回 vad_start + 文件开始时间
6. VAD 检测结束说话 → 返回 vad_end + 文件路径 + 时间范围
7. 服务端返回识别文本
8. 客户端发送关闭 → 服务端关闭录音，解锁
"""
import asyncio
import logging
import os
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

import numpy as np

try:
    import sounddevice as sd
except ImportError:
    sd = None

from .streaming_session import VadState

logger = logging.getLogger(__name__)

SILENCE_TOKENS = {"/sil", "<sil>", "[sil]", "sil"}


def normalize_asr_text(text: str) -> str:
    """Normalize ASR output for subtitle display."""
    normalized = text.strip()
    if normalized.lower() in SILENCE_TOKENS:
        return ""
    return normalized


class RecordingState(str, Enum):
    """录音状态"""
    IDLE = "idle"           # 空闲
    PREPARING = "preparing"  # 准备中（加载模型）
    RECORDING = "recording"  # 录音中
    PAUSED = "paused"       # 暂停
    STOPPING = "stopping"   # 停止中
    STOPPED = "stopped"     # 已停止


@dataclass
class AudioSegment:
    """音频片段"""
    segment_id: str
    file_path: str
    start_time: float      # 秒
    end_time: float        # 秒
    duration: float        # 秒
    text: str = ""         # 识别文本


@dataclass
class VadRecordingSession:
    """
    VAD 录音会话

    管理服务端麦克风录音 + VAD 检测 + 实时识别
    """
    session_id: str
    sample_rate: int = 16000
    chunk_size: int = 3200  # 200ms @ 16kHz
    max_duration: float = 0.0  # 最大录音时长（秒），0 表示不限制

    # 状态
    state: RecordingState = RecordingState.IDLE
    lock_acquired: bool = False

    # VAD
    vad = None
    vad_state: VadState = VadState.SILENCE
    silence_threshold: float = 0.6  # 600ms

    # 音频录制
    audio_stream: Optional[Any] = None
    audio_queue: Optional[asyncio.Queue] = None
    recording_task: Optional[asyncio.Task] = None

    # 录音文件
    record_dir: str = ""
    current_file_path: str = ""
    segment_start_time: float = 0.0
    recorded_samples: List[np.ndarray] = field(default_factory=list)

    # 完整录音保存
    save_audio: bool = False
    save_dir: str = ""  # 最终保存目录（如果提供，录音会复制到此目录）
    full_recording_path: str = ""
    full_recording_samples: List[np.ndarray] = field(default_factory=list)

    # 分段管理
    segments: List[AudioSegment] = field(default_factory=list)
    current_segment_id: Optional[str] = None
    segment_start_sample: int = 0
    _flushed_segment_ids: List[str] = field(default_factory=list)  # 已处理的 segment ID

    # ASR
    asr_service = None
    offline_recognizer = None

    # 字幕模式（true=VAD+ASR，false=简单录音）
    subtitle_mode: bool = True

    # 回调
    on_event_callback: Optional[Callable[[Dict], None]] = None

    # 时间
    start_time: float = 0.0
    total_recorded_duration: float = 0.0

    def __post_init__(self):
        """初始化录音目录"""
        self.record_dir = tempfile.mkdtemp(prefix=f"vad_recording_{self.session_id}_")
        os.makedirs(self.record_dir, exist_ok=True)

    async def prepare(self, asr_service, on_event: Callable[[Dict], None], subtitle_mode: bool = True, model_id: Optional[str] = None) -> bool:
        """
        准备阶段：加载模型、初始化 VAD

        Args:
            asr_service: ASR 服务实例
            on_event: 事件回调函数
            subtitle_mode: 是否启用实时字幕（VAD模式），false 为简单录音模式
            model_id: 指定加载的模型 ID，None 则使用当前已加载模型或默认模型

        Returns:
            是否成功
        """
        self.state = RecordingState.PREPARING
        self.asr_service = asr_service
        self.on_event_callback = on_event
        self.subtitle_mode = subtitle_mode  # 保存 subtitle_mode 到实例属性

        try:
            if subtitle_mode:
                # VAD 模式：需要加载模型和 VAD
                # 确定 model_id：优先使用传入的参数，否则使用当前已加载模型，最后回退到默认
                _model_id = model_id or self.asr_service.current_model_id or "funasr-nano"

                # 确保模型已加载
                if not self.asr_service.current_model_id:
                    await self.asr_service.load_model(_model_id)

                # 获取 offline recognizer
                self.offline_recognizer = self.asr_service.offline_recognizer
                if not self.offline_recognizer:
                    await self.asr_service.load_model(_model_id)
                    self.offline_recognizer = self.asr_service.offline_recognizer

                # 初始化 VAD
                if self.asr_service.vad_config:
                    self.vad = self.asr_service.create_vad_detector()
                    if self.vad:
                        await self._emit({
                            "type": "prepared",
                            "message": "模型加载成功，VAD 已就绪"
                        })
                        return True

                await self._emit({
                    "type": "error",
                    "error": "vad_init_failed",
                    "message": "VAD 初始化失败"
                })
                return False
            else:
                # 简单录音模式：不需要 VAD 和 ASR，只需要初始化音频流
                await self._emit({
                    "type": "prepared",
                    "message": "简单录音模式已就绪"
                })
                return True

        except Exception as e:
            await self._emit({
                "type": "error",
                "error": "prepare_failed",
                "message": str(e)
            })
            return False

    async def start(self) -> bool:
        """开始录音"""
        # 简单录音模式不需要 VAD 检查
        if not self.vad and self.subtitle_mode:
            await self._emit({
                "type": "error",
                "error": "not_prepared",
                "message": "请先调用 prepare"
            })
            return False

        if self.state == RecordingState.RECORDING:
            return True

        self.state = RecordingState.RECORDING
        self.start_time = time.time()
        self.recorded_samples = []
        self.segments = []
        self.vad_state = VadState.SILENCE

        # 创建音频队列
        self.audio_queue = asyncio.Queue()

        # 启动录音任务
        self.recording_task = asyncio.create_task(self._recording_loop())

        await self._emit({
            "type": "started",
            "session_id": self.session_id,
            "sample_rate": self.sample_rate,
            "record_dir": self.record_dir
        })

        return True

    async def stop(self):
        """停止录音"""
        self.state = RecordingState.STOPPING

        # 如果正在说话，等待说完
        if self.vad_state == VadState.SPEAKING:
            logger.info("Waiting for speech to end before stopping...")
            await self._wait_for_speech_end()

        # 停止录音任务
        if self.recording_task:
            self.recording_task.cancel()
            try:
                await self.recording_task
            except asyncio.CancelledError:
                pass

        # 处理剩余音频
        if self.recorded_samples:
            await self._flush_current_segment()

        # 保存完整录音（如果启用）
        if self.save_audio and self.full_recording_samples:
            await self._save_full_recording()

        # 汇总所有片段的文本
        full_text = " ".join(seg.text for seg in self.segments if seg.text)

        await self._emit({
            "type": "stopped",
            "session_id": self.session_id,
            "segments": len(self.segments),
            "total_duration": self.total_recorded_duration,
            "full_recording": self.full_recording_path if self.save_audio else None,
            "text": full_text
        })

        self.state = RecordingState.STOPPED

    async def _wait_for_speech_end(self, timeout: float = 5.0):
        """等待说话结束（等待静音超时）"""
        start_time = time.time()
        while self.vad_state == VadState.SPEAKING:
            if time.time() - start_time > timeout:
                logger.warning("Timeout waiting for speech to end")
                break
            await asyncio.sleep(0.1)

    async def _save_full_recording(self):
        """保存完整录音为 WAV 文件"""
        if not self.full_recording_samples:
            return

        try:
            import soundfile as sf

            audio_data = np.concatenate(self.full_recording_samples)

            # 生成文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"recording_{timestamp}.wav"

            # 如果有 save_dir，保存到 save_dir；否则保存到 record_dir
            if self.save_dir and os.path.isdir(self.save_dir):
                final_path = os.path.join(self.save_dir, filename)
                # 保存到最终目录
                sf.write(final_path, audio_data, self.sample_rate)
                self.full_recording_path = final_path
                logger.info(f"Saved full recording to: {self.full_recording_path} ({len(audio_data)/self.sample_rate:.2f}s)")
            else:
                # 保存到临时目录
                temp_path = os.path.join(self.record_dir, filename)
                sf.write(temp_path, audio_data, self.sample_rate)
                self.full_recording_path = temp_path
                logger.info(f"Saved full recording to temp: {self.full_recording_path} ({len(audio_data)/self.sample_rate:.2f}s)")

        except Exception as e:
            logger.error(f"Failed to save full recording: {e}")
            self.full_recording_path = ""

    async def _recording_loop(self):
        """录音循环 - 在后台线程中运行"""
        if not sd:
            return

        loop = asyncio.get_event_loop()

        def audio_callback(indata, frames, time_info, status):
            if status:
                print(f"Audio status: {status}", file=__import__('sys').stderr)
            # 将音频数据放入队列
            audio_data = indata.copy().flatten()
            asyncio.run_coroutine_threadsafe(
                self.audio_queue.put(audio_data),
                loop
            )

        try:
            with sd.InputStream(
                channels=1,
                samplerate=self.sample_rate,
                blocksize=self.chunk_size,
                callback=audio_callback,
                dtype=np.float32
            ) as stream:
                self.audio_stream = stream
                while self.state == RecordingState.RECORDING:
                    # 检查是否超过最大时长
                    if self.max_duration > 0 and self.total_recorded_duration >= self.max_duration:
                        logger.info(f"Max duration {self.max_duration}s reached")
                        break

                    try:
                        # 带超时获取音频数据
                        audio_chunk = await asyncio.wait_for(
                            self.audio_queue.get(),
                            timeout=1.0
                        )
                        await self._process_audio_chunk(audio_chunk)
                    except asyncio.TimeoutError:
                        continue
                    except Exception as e:
                        print(f"Error in recording loop: {e}")
                        break
        except Exception as e:
            print(f"Audio stream error: {e}")
            await self._emit({
                "type": "error",
                "error": "audio_stream_error",
                "message": str(e)
            })

    async def _process_audio_chunk_simple(self, audio_chunk: np.ndarray):
        """处理音频块（简单录音模式，无需 VAD）"""
        # 记录已录制的样本数
        self.recorded_samples.append(audio_chunk)

        # 简单录音模式：始终保存完整录音
        self.full_recording_samples.append(audio_chunk.copy())

        # 计算当前时间
        current_time = len(self.recorded_samples) * self.chunk_size / self.sample_rate
        self.total_recorded_duration = current_time

    async def _process_audio_chunk(self, audio_chunk: np.ndarray):
        """处理音频块"""
        # 简单录音模式：跳过 VAD 处理
        if not self.subtitle_mode:
            await self._process_audio_chunk_simple(audio_chunk)
            return

        if not self.vad:
            return

        # 喂给 VAD
        self.vad.accept_waveform(audio_chunk)

        # 记录已录制的样本数
        self.recorded_samples.append(audio_chunk)

        # 保存完整录音（如果启用）
        if self.save_audio:
            self.full_recording_samples.append(audio_chunk.copy())

        # 计算当前时间
        current_time = len(self.recorded_samples) * self.chunk_size / self.sample_rate
        self.total_recorded_duration = current_time

        # 检查 VAD 状态
        is_speech = self.vad.is_speech_detected()

        # 状态变化处理
        if is_speech and self.vad_state == VadState.SILENCE:
            # 开始说话
            await self._on_speech_start()
        elif not is_speech and self.vad_state == VadState.SPEAKING:
            # 静音（可能说完）
            await self._check_speech_end()

        # 清空 VAD buffer
        while not self.vad.empty():
            self.vad.pop()

    async def _on_speech_start(self):
        """检测到说话开始"""
        self.vad_state = VadState.SPEAKING
        self.segment_start_sample = len(self.recorded_samples) - 1
        self.segment_start_time = self.total_recorded_duration - (self.chunk_size / self.sample_rate)
        self.current_segment_id = str(uuid.uuid4())[:8]

        await self._emit({
            "type": "vad_start",
            "session_id": self.session_id,
            "segment_id": self.current_segment_id,
            "start_time": round(self.segment_start_time, 2)
        })

    async def _check_speech_end(self):
        """检查是否说完"""
        # 检查静音是否超时
        if self.vad_state == VadState.SPEAKING:
            # 估算静音开始时间（需要累积一些静音块才认为说完）
            # 这里简化处理：连续几个静音块就认为说完
            if not hasattr(self, '_silence_chunks'):
                self._silence_chunks = 0

            self._silence_chunks += 1

            # 大约 3 个 chunk (600ms) 认为说完
            if self._silence_chunks >= 3:
                await self._on_speech_end()
        else:
            self._silence_chunks = 0

    async def _on_speech_end(self):
        """检测到说话结束"""
        self.vad_state = VadState.SILENCE
        self._silence_chunks = 0

        # 保存当前片段
        await self._flush_current_segment()

        await self._emit({
            "type": "vad_end",
            "session_id": self.session_id,
            "segment_id": self.current_segment_id,
            "segments_count": len(self.segments)
        })

    async def _flush_current_segment(self):
        """保存当前录制的音频片段"""
        if not self.recorded_samples:
            return

        # 避免重复处理同一个 segment
        if self.current_segment_id and self.current_segment_id in self._flushed_segment_ids:
            return

        # 获取从当前片段开始的音频
        start_idx = self.segment_start_sample
        segment_samples = self.recorded_samples[start_idx:]

        if not segment_samples:
            return

        # 合并样本
        audio_data = np.concatenate(segment_samples)

        if len(audio_data) < self.sample_rate * 0.1:  # 小于 100ms 忽略
            return

        # 保存为 WAV 文件
        segment_file = os.path.join(
            self.record_dir,
            f"segment_{self.current_segment_id}.wav"
        )

        try:
            import soundfile as sf
            sf.write(segment_file, audio_data, self.sample_rate)

            end_time = self.segment_start_time + len(audio_data) / self.sample_rate
            segment = AudioSegment(
                segment_id=self.current_segment_id,
                file_path=segment_file,
                start_time=self.segment_start_time,
                end_time=end_time,
                duration=len(audio_data) / self.sample_rate
            )
            self.segments.append(segment)
            self._flushed_segment_ids.append(self.current_segment_id)

            # 异步识别
            text = await self._recognize_segment(segment)

            await self._emit({
                "type": "segment_ready",
                "session_id": self.session_id,
                "segment_id": self.current_segment_id,
                "file_path": segment_file,
                "start_time": round(self.segment_start_time, 2),
                "end_time": round(end_time, 2),
                "duration": round(segment.duration, 2),
                "text": text
            })

        except Exception as e:
            print(f"Error saving segment: {e}")
            await self._emit({
                "type": "error",
                "error": "segment_save_failed",
                "message": str(e)
            })

    async def _recognize_segment(self, segment: AudioSegment) -> str:
        """识别音频片段"""
        if not self.offline_recognizer:
            return ""

        try:
            import soundfile as sf
            audio, sr = sf.read(segment.file_path, dtype='float32')

            if len(audio.shape) > 1:
                audio = audio[:, 0]

            if sr != 16000:
                from scipy import signal
                audio = signal.resample(audio, int(len(audio) * 16000 / sr))

            stream = self.offline_recognizer.create_stream()
            stream.accept_waveform(16000, audio.astype(np.float32))
            self.offline_recognizer.decode_stream(stream)
            result = stream.result

            raw_text = result.text if hasattr(result, 'text') else ""
            text = normalize_asr_text(raw_text)
            segment.text = text
            return text

        except Exception as e:
            print(f"Recognition error: {e}")
            return ""

    async def _emit(self, data: Dict):
        """发送事件给客户端"""
        if self.on_event_callback:
            try:
                await self.on_event_callback(data)
            except Exception as e:
                print(f"Error emitting event: {e}")

    def get_status(self) -> Dict[str, Any]:
        """获取状态"""
        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "vad_state": self.vad_state.value,
            "segments_count": len(self.segments),
            "total_duration": round(self.total_recorded_duration, 2),
            "record_dir": self.record_dir
        }

    def cleanup(self):
        """清理资源"""
        # 如果启用了完整录音保存，保留文件（让用户访问）
        # 临时文件将由操作系统自动清理
        if self.save_audio:
            logger.info(f"Preserving recording files in {self.record_dir}")
            return

        # 删除临时文件
        if os.path.exists(self.record_dir):
            import shutil
            shutil.rmtree(self.record_dir, ignore_errors=True)
