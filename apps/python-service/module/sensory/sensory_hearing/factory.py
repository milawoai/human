"""
ASR Service Factory
ASR 服务工厂类
"""
import logging
from typing import Dict, Optional, Type

from .base import ASRModelConfig, ASRModelType, ASRServiceCategory, BaseASRService
from .impl import FunAsrService, Qwen3ASRService, SherpaOnnxFunasrService, SherpaOnnxService

logger = logging.getLogger(__name__)


class ASRServiceFactory:
    """
    ASR 服务工厂类

    用于创建和管理不同类型的 ASR 服务实例
    """

    # 按 ASRModelType 注册的服务类
    _service_classes: Dict[ASRModelType, Type[BaseASRService]] = {
        ASRModelType.FUNASR: FunAsrService,
        ASRModelType.QWEN3: Qwen3ASRService,
    }

    # 按 ASRServiceCategory 注册的服务类
    _category_service_classes: Dict[ASRServiceCategory, Type[BaseASRService]] = {
        ASRServiceCategory.FUNASR_NATIVE: FunAsrService,
        ASRServiceCategory.QWEN3: Qwen3ASRService,
        ASRServiceCategory.SHERPA_ONNX_FUNASR: SherpaOnnxFunasrService,
        # SherpaOnnxService 处理通用的 sherpa-onnx 模型（未单独分类的）
        ASRServiceCategory.SHERPA_ONNX_WHISPER: SherpaOnnxService,
        ASRServiceCategory.SHERPA_ONNX_SENSE_VOICE: SherpaOnnxService,
        ASRServiceCategory.SHERPA_ONNX_PARAFORMER: SherpaOnnxService,
    }

    # 服务实例缓存
    _instances: Dict[str, BaseASRService] = {}

    @classmethod
    def register_service(
        cls,
        model_type: Optional[ASRModelType] = None,
        service_class: Optional[Type[BaseASRService]] = None,
        category: Optional[ASRServiceCategory] = None
    ) -> None:
        """
        注册新的 ASR 服务类

        Args:
            model_type: 模型类型
            service_class: 服务类
            category: 服务分类 (二选一)
        """
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
        **kwargs
    ) -> BaseASRService:
        """
        根据分类创建 ASR 服务实例

        Args:
            category: 服务分类
            config: 模型配置
            debug: 是否启用调试模式
            **kwargs: 其他参数

        Returns:
            ASR 服务实例
        """
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
        **kwargs
    ) -> BaseASRService:
        """
        创建 ASR 服务实例

        Args:
            model_type: 模型类型
            config: 模型配置
            debug: 是否启用调试模式
            **kwargs: 其他参数 (用于兼容旧的初始化方式)

        Returns:
            ASR 服务实例
        """
        if model_type not in cls._service_classes:
            raise ValueError(f"Unknown ASR model type: {model_type}")

        service_class = cls._service_classes[model_type]

        # 创建配置 (如果未提供)
        if config is None:
            config = ASRModelConfig(
                model_type=model_type,
                debug=debug,
                **kwargs
            )

        # 创建服务实例
        return service_class(config=config, debug=debug)

    @classmethod
    def get_or_create_service(
        cls,
        model_type: ASRModelType = ASRModelType.FUNASR,
        model_name: Optional[str] = None,
        config: Optional[ASRModelConfig] = None,
        debug: bool = False,
        **kwargs
    ) -> BaseASRService:
        """
        获取或创建 ASR 服务实例 (单例模式)

        Args:
            model_type: 模型类型
            model_name: 模型名称 (用于缓存键)
            config: 模型配置
            debug: 是否启用调试模式
            **kwargs: 其他参数

        Returns:
            ASR 服务实例
        """
        # 创建缓存键
        cache_key = f"{model_type.value}:{model_name or 'default'}"

        # 检查缓存
        if cache_key in cls._instances:
            logger.debug(f"Returning cached ASR service: {cache_key}")
            return cls._instances[cache_key]

        # 创建新实例
        if config is None:
            config = ASRModelConfig(
                model_type=model_type,
                model_name=model_name,
                debug=debug,
                **kwargs
            )

        service = cls.create_service(model_type=model_type, config=config, debug=debug)
        cls._instances[cache_key] = service
        logger.info(f"Created and cached ASR service: {cache_key}")

        return service

    @classmethod
    def get_supported_models(cls) -> Dict[str, str]:
        """
        获取支持的模型列表

        Returns:
            模型类型到默认模型名称的映射
        """
        return {
            ASRModelType.FUNASR.value: "paraformer-zh-streaming",
            ASRModelType.QWEN3.value: "Qwen/Qwen3-ASR-1.7B",
        }

    @classmethod
    def get_transcribers_info(cls, realtime_only: bool = False) -> Dict[str, any]:
        """
        获取转录器完整信息（包含模型和语言）

        Args:
            realtime_only: 是否只返回支持实时转录的模型

        Returns:
            转录器详细信息，包含模型列表和语言列表
        """
        all_transcribers = {
            "funasr": {
                "label": "FunASR",
                "default_model": "paraformer-zh-streaming",
                "is_realtime": True,  # FunASR 支持实时转录
                "models": [
                    {"label": "流式 (paraformer-zh-streaming)", "value": "paraformer-zh-streaming"},
                    {"label": "离线 (paraformer-zh)", "value": "paraformer-zh"}
                ],
                "languages": [
                    {"label": "中文", "value": "zh"}
                ]
            },
            "qwen3": {
                "label": "Qwen3-ASR",
                "default_model": "Qwen/Qwen3-ASR-1.7B",
                "is_realtime": False,  # Qwen3-ASR 模型较大，不适合实时转录
                "models": [
                    {"label": "Qwen3-ASR-1.7B", "value": "Qwen/Qwen3-ASR-1.7B"}
                ],
                "languages": [
                    {"label": "中文", "value": "Chinese"},
                    {"label": "English", "value": "English"},
                    {"label": "自动检测", "value": "auto"}
                ]
            }
        }

        # 如果只要实时转录器，过滤掉不支持的
        if realtime_only:
            filtered = {k: v for k, v in all_transcribers.items() if v.get("is_realtime", False)}
        else:
            filtered = all_transcribers

        return {
            "python-asr": {
                "label": "Python ASR",
                "transcribers": filtered
            }
        }

    @classmethod
    def clear_cache(cls) -> None:
        """清除服务实例缓存"""
        cls._instances.clear()
        logger.info("ASR service cache cleared")

    @classmethod
    def parse_model_type(cls, model_type_str: str) -> ASRModelType:
        """
        解析模型类型字符串

        Args:
            model_type_str: 模型类型字符串

        Returns:
            ASRModelType 枚举值
        """
        try:
            return ASRModelType(model_type_str.lower())
        except ValueError:
            # 尝试通过常见别名匹配
            aliases = {
                "funasr": ASRModelType.FUNASR,
                "paraformer": ASRModelType.FUNASR,
                "qwen": ASRModelType.QWEN3,
                "qwen3": ASRModelType.QWEN3,
                "qwen3-asr": ASRModelType.QWEN3,
            }
            lower_str = model_type_str.lower()
            if lower_str in aliases:
                return aliases[lower_str]
            raise ValueError(f"Unknown ASR model type: {model_type_str}")
