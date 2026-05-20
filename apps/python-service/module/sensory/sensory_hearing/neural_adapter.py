"""
Neural 适配层

桥接 Neural Core 消息与 sensory_hearing 业务逻辑：
- 收到 Neural control → 分发到 VadRecordingSession
- 业务事件（vad_start / segment_ready / ...）→ 转换为 Neural event
"""
import logging
from typing import Optional

from module.common.neural_topics import EVENT_TOPIC_MAP

from .neural_client import NeuralClient
from .vad_recording_session import VadRecordingSession

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────
# NeuralAdapter
# ──────────────────────────────────────────────

class NeuralAdapter:
    """
    Neural Core ↔ sensory_hearing 桥接器。

    职责：
    1. 接收 Neural control command → 调用 VadRecordingSession 生命周期
    2. 提供 emit_event 方法给 VadRecordingSession 替代原 websocket.send_json
    """

    def __init__(self, neural_client: NeuralClient, asr_service):
        """
        Args:
            neural_client: 已连接的 NeuralClient 实例
            asr_service: ASR 服务实例（SherpaOnnxFunasrService）
        """
        self._client = neural_client
        self._asr_service = asr_service
        self._session: Optional[VadRecordingSession] = None

    # ──────────────────────────────────────────────
    # Query 分发
    # ──────────────────────────────────────────────

    async def handle_query(self, message: dict) -> dict:
        """
        处理 query 类型消息，根据 topic 路由到具体处理函数。

        Args:
            message: {topic: str, payload: dict}

        Returns:
            查询结果 dict
        """
        topic = message.get("topic", "")

        if topic.endswith(".asr_models"):
            return self._query_asr_models()
        else:
            logger.warning("[Adapter] 未知 query topic: %s", topic)
            return {"success": False, "error": f"未知 query topic: {topic}"}

    def _query_asr_models(self) -> dict:
        """查询可用的 ASR 模型列表。"""
        try:
            from .factory import ASRServiceFactory
            info = ASRServiceFactory.get_transcribers_info()
            return {"success": True, "data": info}
        except Exception as e:
            logger.error("[Adapter] 查询 ASR 模型失败: %s", e)
            return {"success": False, "error": str(e)}

    # ──────────────────────────────────────────────
    # Command 分发
    # ──────────────────────────────────────────────

    async def handle_command(self, message: dict):
        """
        处理从 Neural Core 收到的 control/command 消息。

        Args:
            message: BusMessage 格式的完整消息
        """
        topic = message.get("topic", "")
        payload = message.get("payload", {})

        if topic.endswith(".enable"):
            await self._handle_enable(payload)
        elif topic.endswith(".disable"):
            await self._handle_disable()
        else:
            logger.warning("[Adapter] 未知 command topic: %s", topic)
            await self.emit_event("error", {
                "error": "unknown_topic",
                "message": f"未知的 topic: {topic}",
            })

    # ──────────────────────────────────────────────
    # Event 发射
    # ──────────────────────────────────────────────

    async def emit_event(self, event_type: str, data: dict):
        """
        替代原 VadRecordingSession._emit() 的 websocket.send_json。
        将业务事件转换为 Neural event 并发送。

        Args:
            event_type: 事件类型（prepared / started / vad_start / ...）
            data: 事件数据
        """
        topic = EVENT_TOPIC_MAP.get(event_type)
        if not topic:
            logger.warning("[Adapter] 未映射的事件类型: %s", event_type)
            return

        # 构造 payload：合并 type 到 data 中，方便消费端区分
        payload = {"type": event_type, **data}

        logger.info("[Adapter] 发送 event: topic=%s, type=%s", topic, event_type)
        await self._client.send_event(topic, payload)


    # ──────────────────────────────────────────────
    # 内部方法
    # ──────────────────────────────────────────────

    async def _graceful_stop(self):
        """安全关闭当前会话并等待完成。"""
        if self._session is None:
            return
        try:
            await self._session.stop()
            self._session.cleanup()
        except Exception as e:
            logger.error("[Adapter] 关闭旧会话异常: %s", e)
        finally:
            self._session = None

    async def _handle_enable(self, payload: dict):
        """处理 enable command：准备 + 开始录音。"""
        # 有存活会话 → 先关闭再重启
        if self._session is not None:
            logger.warning("[Adapter] 存在存活会话，先关闭再重启")
            await self._graceful_stop()

        import uuid

        subtitle_mode = payload.get("subtitle_mode", True)
        save_audio = payload.get("save_audio", False)
        save_dir = payload.get("save_dir")
        model_id = payload.get("model_id")

        session_id = str(uuid.uuid4())[:8]
        session = VadRecordingSession(session_id=session_id)

        # 保存目录
        if save_dir:
            session.save_dir = save_dir

        # 替换 _emit 为 Neural 适配层的 emit_event
        # VadRecordingSession 原来通过 on_event_callback 回调，现在改为调用 self.emit_event
        async def on_event(event_data: dict):
            event_type = event_data.get("type", "unknown")
            await self.emit_event(event_type, event_data)

        # 准备
        success = await session.prepare(self._asr_service, on_event, subtitle_mode=subtitle_mode, model_id=model_id)
        if not success:
            logger.error("[Adapter] 准备失败")
            return

        # 设置保存录音
        session.save_audio = save_audio

        # 开始
        await session.start()

        self._session = session
        logger.info("[Adapter] 录音已启动: session_id=%s", session_id)

    async def _handle_disable(self):
        """处理 disable command：停止录音。"""
        await self._graceful_stop()
        logger.info("[Adapter] 录音已停止")

    # ──────────────────────────────────────────────
    # 状态查询
    # ──────────────────────────────────────────────

    def get_status(self) -> dict:
        """获取当前适配器状态。"""
        if self._session:
            return {
                "recording": True,
                **self._session.get_status(),
            }
        return {"recording": False}
