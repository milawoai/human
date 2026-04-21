"""
Neural Query Router

提供 /neural/query HTTP 端点，
接收 {topic, payload}，转发给 NeuralAdapter 处理并返回业务数据。
"""
import logging

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter()

# 由 controllers.py 在创建 adapter 后注入
_adapter = None


def set_adapter(adapter):
    """注入 NeuralAdapter 实例。"""
    global _adapter
    _adapter = adapter


@router.post("/neural/query")
async def neural_query(body: dict):
    """统一 query 入口，接收 {topic, payload}，返回业务数据。"""
    if _adapter is None:
        return {"success": False, "error": "Neural adapter 未初始化"}

    result = await _adapter.handle_query(body)
    return result
