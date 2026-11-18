"""
Neural Core WebSocket 客户端

通过 Socket.IO 连接 NestJS Neural Core（端口 12002），
注册 sensory-hearing Actor + Capability，接收 control 消息。
"""
import logging
import asyncio
import os
from .recovery import RecoveryLoop
from .neural_events import setup_events
from runtime.identity import identity
import socketio

from module.common.neural_topics import (
    ACTORS,
    CAPABILITIES,
    SUBSCRIBE_TOPICS,
    SUBSCRIBE_KINDS,
)

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# 配置
# ──────────────────────────────────────────────

NEURAL_WS_URL = os.environ.get("HUMAN_NEURAL_URL", "http://127.0.0.1:12002/neural")
HEARTBEAT_INTERVAL = 30  # 秒

BODY_ACTOR = ACTORS["SENSORY_HEARING"]


# ──────────────────────────────────────────────
# NeuralClient
# ──────────────────────────────────────────────

class NeuralClient:
    """
    Socket.IO 客户端，连接 Neural Core 并注册 sensory-hearing Actor。

    使用方式：
        client = NeuralClient(on_command=my_handler)
        await client.connect()
        # ...
        await client.disconnect()
    """

    def __init__(self, on_command=None, on_connection_lost=None):
        """
        Args:
            on_command: 收到 control 消息时的回调，签名 (message: dict) -> None
        """
        self._on_command = on_command
        self._sio = socketio.AsyncClient(
            reconnection=False,
            logger=False,
            engineio_logger=False,
        )
        self._heartbeat_timer = None
        self._connected = False
        self._registered = False

        self._on_connection_lost = on_connection_lost
        self.instance_id = identity['instanceId']
        self.neural_instance_id = None
        self._capabilities_ready = self._subscriptions_ready = False
        self._ready = asyncio.Event()
        self._disconnected = asyncio.Event()
        self._recovery = RecoveryLoop(self._connection_cycle)
        setup_events(self)

    # ──────────────────────────────────────────────
    # 公共 API
    # ──────────────────────────────────────────────

    async def connect(self) -> bool:
        """Schedule recovery without blocking HTTP startup."""
        self._recovery.start()
        return True

    async def _connection_cycle(self):
        self._disconnected.clear()
        self._ready.clear()
        try:
            await asyncio.wait_for(self._sio.connect(os.environ.get("HUMAN_NEURAL_URL", NEURAL_WS_URL), namespaces=["/neural"], retry=False), 10)
            await asyncio.wait_for(self._ready.wait(), 10)
            await self._disconnected.wait()
        finally:
            if self._sio.connected:
                await self._sio.disconnect()

    async def disconnect(self):
        await self._recovery.stop()
        self._stop_heartbeat()
        if self._sio.connected:
            await self._sio.disconnect()
        self._connected = self._registered = False
        self._ready.clear()

    async def send_event(self, topic: str, payload: dict):
        """
        发送 event 消息到 Neural Core，由其广播给订阅者。

        Args:
            topic: 事件 topic，如 sensory.hearing.caption_stream.segment
            payload: 事件内容
        """
        if not self._sio.connected:
            logger.warning("[Neural] 未连接，无法发送 event: %s", topic)
            return

        message = {
            "kind": "event",
            "topic": topic,
            "source": BODY_ACTOR,
            "payload": payload,
        }
        await self._sio.emit("message", message, namespace="/neural")

    @property
    def is_ready(self) -> bool:
        return self._connected and self._registered and self._capabilities_ready and self._subscriptions_ready

    # ──────────────────────────────────────────────
    # Socket.IO 事件
    # ──────────────────────────────────────────────

    async def _register_actor(self):
        """注册 Actor 身份。"""
        await self._sio.emit(
            "register",
            {"actor": BODY_ACTOR, "protocolVersion": 1, "serviceInstanceId": self.instance_id},
            namespace="/neural",
        )
        logger.info("[Neural] 已发送 register: %s", BODY_ACTOR["actorId"])

    async def _register_capabilities(self):
        """注册能力列表。"""
        await self._sio.emit(
            "register_capabilities",
            {"capabilities": [cap for cap in CAPABILITIES if cap["actor"]["actorId"] == BODY_ACTOR["actorId"]]},
            namespace="/neural",
        )
        logger.info("[Neural] 已注册 %d 个 Capability", len(CAPABILITIES))

    async def _subscribe_topics(self):
        """订阅感兴趣的 topic。"""
        await self._sio.emit(
            "subscribe",
            {"topics": SUBSCRIBE_TOPICS, "kinds": SUBSCRIBE_KINDS},
            namespace="/neural",
        )
        logger.info("[Neural] 已订阅: %s", SUBSCRIBE_TOPICS)

    # ──────────────────────────────────────────────
    # 心跳
    # ──────────────────────────────────────────────

    def _start_heartbeat(self):
        """启动定时心跳。"""
        import asyncio

        self._stop_heartbeat()

        async def _heartbeat_loop():
            while self._connected:
                try:
                    await self._sio.emit("heartbeat", namespace="/neural")
                except Exception:
                    pass
                await asyncio.sleep(HEARTBEAT_INTERVAL)

        self._heartbeat_timer = asyncio.ensure_future(_heartbeat_loop())

    def _stop_heartbeat(self):
        """停止心跳。"""
        if self._heartbeat_timer is not None:
            self._heartbeat_timer.cancel()
            self._heartbeat_timer = None
