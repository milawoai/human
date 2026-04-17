"""
ASR Service Base Class
ASR 服务抽象基类
"""
import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, Optional


class ASRModelType(str, Enum):
    """ASR 模型类型枚举"""
    FUNASR = "funasr"
    QWEN3 = "qwen3"


class ASRServiceCategory(str, Enum):
    """ASR 服务分类枚举 - 决定由哪个服务处理"""
    # FunASR 原生服务 (Python)
    FUNASR_NATIVE = "funasr-native"
    # Sherpa-ONNX 系列服务
    SHERPA_ONNX_FUNASR = "sherpa-onnx-funasr"
    SHERPA_ONNX_WHISPER = "sherpa-onnx-whisper"
    SHERPA_ONNX_SENSE_VOICE = "sherpa-onnx-sense-voice"
    SHERPA_ONNX_PARAFORMER = "sherpa-onnx-paraformer"
    # Qwen3 服务
    QWEN3 = "qwen3"


@dataclass
class ASRModelConfig:
    """ASR 模型配置"""
    model_type: ASRModelType = ASRModelType.FUNASR
    model_name: Optional[str] = None
    model_path: Optional[str] = None
    # Qwen3 特有配置
    aligner_path: Optional[str] = None
    device: str = "cuda:0"
    dtype: str = "bfloat16"
    gpu_memory_utilization: float = 0.7
    # 通用配置
    sample_rate: int = 16000
    debug: bool = False


@dataclass
class ASRSessionState:
    """ASR 会话状态"""
    session_id: str
    cache: Dict[str, Any] = field(default_factory=dict)
    audio_buffer: bytearray = field(default_factory=bytearray)


class BaseASRService(ABC):
    """
    ASR 服务抽象基类

    所有 ASR 模型实现都必须继承此类并实现其抽象方法
    """

    def __init__(self, config: Optional[ASRModelConfig] = None):
        """
        初始化 ASR 服务

        Args:
            config: 模型配置
        """
        self.config = config or ASRModelConfig()
        self.model = None
        self.model_loaded = False
        self._lock = asyncio.Lock()
        # 流式识别会话管理
        self.streaming_sessions: Dict[str, ASRSessionState] = {}
        # 采样率配置
        self.input_sample_rate = 24000
        self.target_sample_rate = self.config.sample_rate

    @property
    @abstractmethod
    def model_type(self) -> ASRModelType:
        """获取模型类型"""
        pass

    @property
    @abstractmethod
    def default_model_name(self) -> str:
        """获取默认模型名称"""
        pass

    @abstractmethod
    async def load_model(self, model_name: Optional[str] = None) -> None:
        """
        加载 ASR 模型

        Args:
            model_name: 模型名称或路径
        """
        pass

    @abstractmethod
    async def transcribe_chunk(
        self,
        audio_data: bytes,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        转录音频块 - 流式识别

        Args:
            audio_data: 音频数据(PCM 格式)
            config: 转录配置

        Returns:
            转录结果字典，包含:
            - success: bool - 是否成功
            - text: str - 识别文本
            - is_final: bool - 是否为最终结果
            - error: str - 错误信息(可选)
        """
        pass

    @abstractmethod
    async def transcribe_file(
        self,
        audio_path: str,
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            config: 转录配置

        Returns:
            转录结果字典
        """
        pass

    @abstractmethod
    async def finalize_session(
        self,
        session_id: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        结束会话,处理剩余缓冲区数据

        Args:
            session_id: 会话ID
            config: 转录配置

        Returns:
            最终转录结果
        """
        pass

    def get_status(self) -> Dict[str, Any]:
        """
        获取服务状态

        Returns:
            状态字典
        """
        return {
            "model_type": self.model_type.value,
            "model_loaded": self.model_loaded,
            "model_name": self.config.model_name or self.default_model_name if self.model_loaded else "",
            "active_sessions": len(self.streaming_sessions)
        }

    def get_or_create_session(self, session_id: str) -> ASRSessionState:
        """
        获取或创建会话状态

        Args:
            session_id: 会话ID

        Returns:
            会话状态对象
        """
        if session_id not in self.streaming_sessions:
            self.streaming_sessions[session_id] = ASRSessionState(session_id=session_id)
        return self.streaming_sessions[session_id]

    def cleanup_session(self, session_id: str) -> None:
        """
        清理会话

        Args:
            session_id: 会话ID
        """
        if session_id in self.streaming_sessions:
            del self.streaming_sessions[session_id]

    def resample_audio(self, audio_data: bytes, from_rate: int, to_rate: int) -> bytes:
        """
        重采样音频数据

        Args:
            audio_data: PCM音频数据
            from_rate: 源采样率
            to_rate: 目标采样率

        Returns:
            重采样后的音频数据
        """
        if from_rate == to_rate:
            return audio_data

        import numpy as np
        from scipy import signal

        # 转换为numpy数组
        audio_array = np.frombuffer(audio_data, dtype=np.int16)

        # 计算重采样比例
        num_samples = int(len(audio_array) * to_rate / from_rate)

        # 使用scipy的resample进行重采样
        resampled = signal.resample(audio_array, num_samples)

        # 转回int16并返回字节
        resampled_int16 = resampled.astype(np.int16)
        return resampled_int16.tobytes()
