"""
Speech Recognition Services
语音识别服务

支持 Sherpa-ONNX ASR 模型的统一接口
"""
import logging
from typing import Optional

# 导出基类和配置
from .base import ASRModelConfig, ASRModelType, BaseASRService
# 导出工厂类
from .factory import ASRServiceFactory

logger = logging.getLogger(__name__)

# 模块级别的默认服务实例 (保持向后兼容性)
_default_service: Optional[BaseASRService] = None


def get_default_service(model_type: str = "funasr", debug: bool = False) -> BaseASRService:
    """
    获取默认的 ASR 服务实例

    Args:
        model_type: 模型类型，目前支持 "funasr"/"sherpa-onnx-funasr"
        debug: 是否启用调试模式

    Returns:
        ASR 服务实例
    """
    global _default_service

    if _default_service is None:
        parsed_type = ASRServiceFactory.parse_model_type(model_type)
        _default_service = ASRServiceFactory.create_service(
            model_type=parsed_type,
            debug=debug
        )
        logger.info(f"Created default ASR service: {model_type}")

    return _default_service


def create_service(
    model_type: str = "funasr",
    model_path: Optional[str] = None,
    debug: bool = False,
    **kwargs
) -> BaseASRService:
    """
    创建 ASR 服务实例的便捷函数

    Args:
        model_type: 模型类型，目前支持 "funasr"/"sherpa-onnx-funasr"
        model_path: 模型路径 (可选)
        debug: 是否启用调试模式
        **kwargs: 其他配置参数

    Returns:
        ASR 服务实例
    """
    parsed_type = ASRServiceFactory.parse_model_type(model_type)

    config = ASRModelConfig(
        model_type=parsed_type,
        model_path=model_path,
        debug=debug,
        **kwargs
    )

    return ASRServiceFactory.create_service(
        model_type=parsed_type,
        config=config,
        debug=debug
    )


__all__ = [
    "BaseASRService",
    "ASRModelConfig",
    "ASRModelType",
    "ASRServiceFactory",
    "get_default_service",
    "create_service",
]
