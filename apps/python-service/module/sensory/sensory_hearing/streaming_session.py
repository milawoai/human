"""
Streaming Session Management
WebSocket 流式识别会话管理
支持 Online ASR 和 VAD + Offline ASR 两种模式
"""
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

import numpy as np

try:
    import sherpa_onnx
except ImportError:
    sherpa_onnx = None


class StreamingMode(str, Enum):
    """流式识别模式"""
    ONLINE = "online"      # 真流式：边说边出字
    SEGMENT = "segment"   # 伪流式：VAD + Offline ASR
    AUTO = "auto"         # 自动：根据模型能力选择


class VadState(str, Enum):
    """VAD 状态"""
    SILENCE = "silence"    # 静音中
    SPEAKING = "speaking"  # 说话中


@dataclass
class StreamingSession:
    """
    流式识别会话状态机

    管理一个 WebSocket 连接的生命周期内的所有状态
    """
    session_id: str
    mode: StreamingMode = StreamingMode.AUTO
    sample_rate: int = 16000

    # VAD 相关
    vad_state: VadState = VadState.SILENCE
    vad: Optional[Any] = None  # sherpa_onnx.VoiceActivityDetector
    last_speech_time: float = 0.0
    silence_threshold: float = 0.6  # 600ms 静音认为说完

    # 音频缓冲区 (segment 模式用)
    audio_buffer: List[np.ndarray] = field(default_factory=list)
    buffer_start_time: float = 0.0

    # Online ASR 相关
    online_recognizer: Optional[Any] = None
    online_stream: Optional[Any] = None
    partial_text: str = ""

    # 音频保存相关
    save_audio: bool = False  # 是否保存录音
    recorded_audio: List[np.ndarray] = field(default_factory=list)  # 完整录音缓冲

    # 回调
    on_result_callback: Optional[Callable[[Dict], None]] = None

    # 状态
    is_active: bool = False

    def start_speaking(self):
        """开始说话"""
        self.vad_state = VadState.SPEAKING
        self.last_speech_time = time.time()
        if not self.audio_buffer:
            self.buffer_start_time = time.time()

    def end_speaking(self):
        """结束说话"""
        self.vad_state = VadState.SILENCE

    def add_audio(self, audio: np.ndarray):
        """添加音频到缓冲区"""
        self.audio_buffer.append(audio)
        self.last_speech_time = time.time()

    def get_buffered_audio(self) -> Optional[np.ndarray]:
        """获取缓冲区音频"""
        if not self.audio_buffer:
            return None
        return np.concatenate(self.audio_buffer)

    def clear_buffer(self):
        """清空缓冲区"""
        self.audio_buffer = []
        self.buffer_start_time = 0.0

    def set_save_audio(self, save: bool):
        """设置是否保存录音"""
        self.save_audio = save
        if save:
            self.recorded_audio = []

    def add_recorded_audio(self, audio: np.ndarray):
        """添加音频到录音缓冲"""
        if self.save_audio:
            self.recorded_audio.append(audio.copy())

    def get_recorded_audio(self) -> Optional[np.ndarray]:
        """获取完整录音"""
        if not self.recorded_audio:
            return None
        return np.concatenate(self.recorded_audio)

    def get_recorded_duration(self) -> float:
        """获取录音时长（秒）"""
        if not self.recorded_audio:
            return 0.0
        total_samples = sum(len(chunk) for chunk in self.recorded_audio)
        return total_samples / self.sample_rate

    def clear_recorded_audio(self):
        """清空录音缓冲"""
        self.recorded_audio = []

    def get_silence_duration(self) -> float:
        """获取当前静音时长"""
        if self.vad_state == VadState.SPEAKING:
            return 0.0
        return time.time() - self.last_speech_time

    def is_speech_ended(self) -> bool:
        """判断是否说完（静音超过阈值）"""
        return self.vad_state == VadState.SILENCE and self.get_silence_duration() >= self.silence_threshold

    async def process_audio_online(self, audio: np.ndarray) -> Dict[str, Any]:
        """
        Online 模式处理音频（边说边出字）
        """
        if not self.online_recognizer or not self.online_stream:
            return {}

        self.online_stream.accept_waveform(self.sample_rate, audio)

        results = []
        while self.online_recognizer.is_ready(self.online_stream):
            self.online_recognizer.decode_stream(self.online_stream)

        result = self.online_recognizer.get_result(self.online_stream)
        if result.text and result.text != self.partial_text:
            self.partial_text = result.text
            results.append({
                "type": "partial",
                "text": result.text
            })

        # 检查是否说完
        if self.online_recognizer.is_endpoint(self.online_stream):
            results.append({
                "type": "final",
                "text": self.partial_text
            })
            self.online_recognizer.reset(self.online_stream)
            self.partial_text = ""

        return results

    def process_audio_vad(self, audio: np.ndarray) -> Dict[str, Any]:
        """
        Segment 模式：VAD 检测 + Offline ASR 处理
        返回事件类型
        """
        if not self.vad:
            return {}

        # 喂给 VAD
        self.vad.accept_waveform(audio)

        events = []

        # 检查 VAD 状态变化
        while not self.vad.empty():
            speech_segment = self.vad.front
            self.vad.pop()

            if speech_segment.is_speech:
                # 检测到说话开始
                if self.vad_state == VadState.SILENCE:
                    events.append({"type": "vad_start"})
                    self.start_speaking()

                # 添加音频到缓冲区
                self.add_audio(speech_segment.samples)
            else:
                # 静音
                if self.vad_state == VadState.SPEAKING:
                    self.end_speaking()

        # 检查是否说完（静音超时）
        if self.vad_state == VadState.SILENCE and self.audio_buffer:
            silence_dur = self.get_silence_duration()
            if silence_dur >= self.silence_threshold:
                events.append({"type": "vad_end"})
                events.append({"type": "speech_end"})

        return events

    def get_status(self) -> Dict[str, Any]:
        """获取会话状态"""
        return {
            "session_id": self.session_id,
            "mode": self.mode.value,
            "vad_state": self.vad_state.value,
            "buffer_size": len(self.audio_buffer),
            "is_active": self.is_active
        }
