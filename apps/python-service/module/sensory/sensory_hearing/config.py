"""
ASR Configuration
ASR 配置管理
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Dict, Optional

from .base import ASRServiceCategory


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

    # 通用配置
    sample_rate: int = 16000
    debug: bool = False

    @classmethod
    def from_env(cls) -> "ASRServiceConfig":
        """从环境变量加载配置"""
        audio_root = os.getenv("AUDIO_MODEL_ROOT", "/Users/zhou/Downloads/model/audio/onnx")

        config = cls(
            audio_model_root=audio_root,
            sample_rate=int(os.getenv("ASR_SAMPLE_RATE", "16000")),
            debug=os.getenv("ASR_DEBUG", "false").lower() == "true",
        )

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
        }


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
