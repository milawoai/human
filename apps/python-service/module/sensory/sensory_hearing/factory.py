"""
ASR Service Factory
ASR 服务工厂类
"""
import logging
from typing import Dict, Optional, Type

from .base import ASRModelConfig, ASRModelType, ASRServiceCategory, BaseASRService
from .impl import SherpaOnnxFunasrService, SherpaOnnxService

logger = logging.getLogger(__name__)


class ASRServiceFactory:
    """用于创建和缓存 Sherpa-ONNX ASR 服务实例。"""

    _service_classes: Dict[ASRModelType, Type[BaseASRService]] = {
        ASRModelType.FUNASR: SherpaOnnxFunasrService,
    }

    _category_service_classes: Dict[ASRServiceCategory, Type[BaseASRService]] = {
        ASRServiceCategory.SHERPA_ONNX_FUNASR: SherpaOnnxFunasrService,
        ASRServiceCategory.SHERPA_ONNX_WHISPER: SherpaOnnxService,
        ASRServiceCategory.SHERPA_ONNX_SENSE_VOICE: SherpaOnnxService,
        ASRServiceCategory.SHERPA_ONNX_PARAFORMER: SherpaOnnxService,
    }

    _instances: Dict[str, BaseASRService] = {}

    @classmethod
    def register_service(
        cls,
        model_type: Optional[ASRModelType] = None,
        service_class: Optional[Type[BaseASRService]] = None,
        category: Optional[ASRServiceCategory] = None,
    ) -> None:
        """注册新的 ASR 服务类。"""
        if service_class is None:
            raise ValueError("service_class is required")

        if category:
            cls._category_service_classes[category] = service_class
            logger.info(f"Registered ASR service by category: {category.value}")
        elif model_type:
            cls._service_classes[model_type] = service_class
            logger.info(f"Registered ASR service by type: {model_type.value}")

    @classmethod
    def create_service_by_category(
        cls,
        category: ASRServiceCategory,
        config: Optional[ASRModelConfig] = None,
        debug: bool = False,
        **kwargs,
    ) -> BaseASRService:
        """根据分类创建 ASR 服务实例。"""
        if category not in cls._category_service_classes:
            raise ValueError(f"Unknown ASR service category: {category}")

        service_class = cls._category_service_classes[category]
        logger.info(f"Creating ASR service for category: {category.value}")

        if config is None:
            config = ASRModelConfig(debug=debug, **kwargs)

        return service_class(config=config, debug=debug)

    @classmethod
    def create_service(
        cls,
        model_type: ASRModelType = ASRModelType.FUNASR,
        config: Optional[ASRModelConfig] = None,
        debug: bool = False,
        **kwargs,
    ) -> BaseASRService:
        """创建 ASR 服务实例。"""
        if model_type not in cls._service_classes:
            raise ValueError(f"Unknown ASR model type: {model_type}")

        service_class = cls._service_classes[model_type]

        if config is None:
            config = ASRModelConfig(
                model_type=model_type,
                debug=debug,
                **kwargs,
            )

        return service_class(config=config, debug=debug)

    @classmethod
    def get_or_create_service(
        cls,
        model_type: ASRModelType = ASRModelType.FUNASR,
        model_name: Optional[str] = None,
        config: Optional[ASRModelConfig] = None,
        debug: bool = False,
        **kwargs,
    ) -> BaseASRService:
        """获取或创建 ASR 服务实例。"""
        cache_key = f"{model_type.value}:{model_name or 'default'}"

        if cache_key in cls._instances:
            logger.debug(f"Returning cached ASR service: {cache_key}")
            return cls._instances[cache_key]

        if config is None:
            config = ASRModelConfig(
                model_type=model_type,
                model_name=model_name,
                debug=debug,
                **kwargs,
            )

        service = cls.create_service(model_type=model_type, config=config, debug=debug)
        cls._instances[cache_key] = service
        logger.info(f"Created and cached ASR service: {cache_key}")

        return service

    @classmethod
    def get_supported_models(cls) -> Dict[str, str]:
        """获取支持的模型列表。"""
        return {
            ASRModelType.FUNASR.value: "sherpa-onnx-funasr",
        }

    @classmethod
    def get_transcribers_info(cls, realtime_only: bool = False) -> Dict[str, object]:
        """获取转录器信息。"""
        transcribers = {
            "funasr": {
                "label": "Sherpa-ONNX FunASR",
                "default_model": "funasr-nano",
                "is_realtime": True,
                "models": [
                    {"label": "FunASR Nano", "value": "funasr-nano"},
                    {"label": "FunASR Nano FP16", "value": "funasr-nano-fp16"},
                    {"label": "FunASR Nano INT8", "value": "funasr-nano-int8"},
                ],
                "languages": [
                    {"label": "中文", "value": "zh"},
                ],
            },
        }

        if realtime_only:
            transcribers = {
                key: value
                for key, value in transcribers.items()
                if value.get("is_realtime", False)
            }

        return {
            "python-asr": {
                "label": "Python ASR",
                "transcribers": transcribers,
            },
        }

    @classmethod
    def clear_cache(cls) -> None:
        """清除服务实例缓存。"""
        cls._instances.clear()
        logger.info("ASR service cache cleared")

    @classmethod
    def parse_model_type(cls, model_type_str: str) -> ASRModelType:
        """解析模型类型字符串。"""
        aliases = {
            "funasr": ASRModelType.FUNASR,
            "sherpa-onnx": ASRModelType.FUNASR,
            "sherpa-onnx-funasr": ASRModelType.FUNASR,
            "paraformer": ASRModelType.FUNASR,
        }
        lower_str = model_type_str.lower()
        if lower_str in aliases:
            return aliases[lower_str]
        raise ValueError(f"Unknown ASR model type: {model_type_str}")
