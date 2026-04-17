"""
ASR Configuration
ASR 配置管理
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, Optional

from .base import ASRServiceCategory


def _detect_device() -> tuple[str, float]:
    """检测可用设备，有 GPU 用 GPU，否则用 CPU"""
    # 优先检查环境变量
    env_device = os.getenv("ASR_DEVICE", "").strip().lower()
    if env_device in ("cuda", "cuda:0", "cuda:1", "cuda:2", "cuda:3"):
        return env_device, 0.7

    # 尝试用 torch 检测 CUDA
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0", 0.7
        # macOS MPS 支持
        if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps", 0.7
    except ImportError:
        pass

    # 默认用 CPU
    return "cpu", 0.0


@dataclass
class ModelDefinition:
    """模型定义"""
    id: str = ""
    model_path: str = ""
    can_streaming: bool = False
    engine: str = "sherpa-onnx"
    # 服务分类 - 决定由哪个服务处理
    category: ASRServiceCategory = ASRServiceCategory.SHERPA_ONNX_FUNASR


@dataclass
class ASRServiceConfig:
    """ASR 服务全局配置"""

    # 模型根路径 (Sherpa-ONNX)
    audio_model_root: str = "/Users/zhou/Downloads/model/audio/onnx"

    # 静态模型注册表 (配置一个生效一个)
    model_registry: Dict[str, ModelDefinition] = field(default_factory=dict)

    # 默认模型类型
    default_model_type: str = "sherpa-onnx"

    # FunASR 配置 (保留兼容性)
    funasr_model_name: str = "paraformer-zh-streaming"
    funasr_model_path: Optional[str] = None

    # Qwen3-ASR 配置 (保留兼容性)
    qwen3_model_name: str = "Qwen/Qwen3-ASR-1.7B"
    qwen3_model_path: Optional[str] = None
    qwen3_aligner_path: Optional[str] = None

    # 通用配置
    sample_rate: int = 16000
    debug: bool = False
    device: str = "cpu"
    dtype: str = "bfloat16"
    gpu_memory_utilization: float = 0.0

    @classmethod
    def from_env(cls) -> "ASRServiceConfig":
        """从环境变量加载配置"""
        audio_root = os.getenv("AUDIO_MODEL_ROOT", "/Users/zhou/Downloads/model/audio/onnx")

        # 自动检测设备
        detected_device, detected_gpu_mem = _detect_device()

        config = cls(
            audio_model_root=audio_root,
            default_model_type=os.getenv("ASR_DEFAULT_MODEL", "sherpa-onnx"),
            funasr_model_name=os.getenv("ASR_FUNASR_MODEL", "paraformer-zh-streaming"),
            funasr_model_path=os.getenv("ASR_FUNASR_MODEL_PATH"),
            qwen3_model_name=os.getenv("ASR_QWEN3_MODEL", "Qwen/Qwen3-ASR-1.7B"),
            qwen3_model_path=os.getenv("ASR_QWEN3_MODEL_PATH"),
            qwen3_aligner_path=os.getenv("ASR_QWEN3_ALIGNER_PATH"),
            sample_rate=int(os.getenv("ASR_SAMPLE_RATE", "16000")),
            debug=os.getenv("ASR_DEBUG", "false").lower() == "true",
            device=detected_device,
            dtype=os.getenv("ASR_DTYPE", "bfloat16"),
            gpu_memory_utilization=detected_gpu_mem,
        )

        print(f"🔍 ASR Device detected: {config.device}, GPU memory: {config.gpu_memory_utilization}")

        # 初始化静态模型注册表
        config._init_model_registry()

        return config

    def _init_model_registry(self) -> None:
        """初始化静态模型注册表"""
        self.model_registry = {
            # Sherpa-ONNX FunASR 系列 (使用 SherpaOnnxFunasrService)
            "funasr-nano": ModelDefinition(
                id="funasr-nano",
                model_path=f"{self.audio_model_root}/funasr-nano",
                can_streaming=False,
                engine="sherpa-onnx",
                category=ASRServiceCategory.SHERPA_ONNX_FUNASR,
            ),
            "funasr-nano-fp16": ModelDefinition(
                id="funasr-nano-fp16",
                model_path=f"{self.audio_model_root}/funasr-nano-fp16",
                can_streaming=False,
                engine="sherpa-onnx",
                category=ASRServiceCategory.SHERPA_ONNX_FUNASR,
            ),
            "funasr-nano-int8": ModelDefinition(
                id="funasr-nano-int8",
                model_path=f"{self.audio_model_root}/funasr-nano-int8",
                can_streaming=False,
                engine="sherpa-onnx",
                category=ASRServiceCategory.SHERPA_ONNX_FUNASR,
            ),
            # Sherpa-ONNX Whisper 系列 (预留)
            # "whisper-base": ModelDefinition(
            #     id="whisper-base",
            #     model_path=f"{self.audio_model_root}/whisper-base",
            #     can_streaming=False,
            #     engine="sherpa-onnx",
            #     category=ASRServiceCategory.SHERPA_ONNX_WHISPER,
            # ),
            # Sherpa-ONNX SenseVoice 系列 (预留)
            # "sense-voice": ModelDefinition(
            #     id="sense-voice",
            #     model_path=f"{self.audio_model_root}/sense-voice",
            #     can_streaming=False,
            #     engine="sherpa-onnx",
            #     category=ASRServiceCategory.SHERPA_ONNX_SENSE_VOICE,
            # ),
            # Sherpa-ONNX Paraformer 系列 (预留)
            # "paraformer-zh": ModelDefinition(
            #     id="paraformer-zh",
            #     model_path=f"{self.audio_model_root}/paraformer-zh",
            #     can_streaming=False,
            #     engine="sherpa-onnx",
            #     category=ASRServiceCategory.SHERPA_ONNX_PARAFORMER,
            # ),
            # FunASR 原生系列 (预留)
            # "paraformer-zh-streaming": ModelDefinition(
            #     id="paraformer-zh-streaming",
            #     model_path=self.funasr_model_path,
            #     can_streaming=True,
            #     engine="funasr",
            #     category=ASRServiceCategory.FUNASR_NATIVE,
            # ),
        }

    def get_model_path(self, model_type: str) -> Optional[str]:
        """获取指定类型模型的路径"""
        if model_type == "funasr":
            return self.funasr_model_path
        elif model_type == "qwen3":
            return self.qwen3_model_path
        return None

    def get_model_name(self, model_type: str) -> str:
        """获取指定类型模型的名称"""
        if model_type == "funasr":
            return self.funasr_model_name
        elif model_type == "qwen3":
            return self.qwen3_model_name
        return ""


# 全局配置实例
_config: Optional[ASRServiceConfig] = None


def get_config() -> ASRServiceConfig:
    """获取全局配置实例"""
    global _config
    if _config is None:
        _config = ASRServiceConfig.from_env()
    return _config


def set_config(config: ASRServiceConfig) -> None:
    """设置全局配置实例"""
    global _config
    _config = config
