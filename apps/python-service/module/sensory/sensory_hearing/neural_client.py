"""
Neural Core WebSocket 客户端

通过 Socket.IO 连接 NestJS Neural Core（端口 12002），
注册 sensory-hearing Actor + Capability，接收 control 消息。
"""
import logging
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

NEURAL_WS_URL = "http://localhost:12002/neural"
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

    def __init__(self, on_command=None):
        """
        Args:
            on_command: 收到 control 消息时的回调，签名 (message: dict) -> None
        """
        self._on_command = on_command
        self._sio = socketio.AsyncClient(
            reconnection=True,
            reconnection_delay=3000,
            reconnection_attempts=10,
            logger=False,
            engineio_logger=False,
        )
        self._heartbeat_timer = None
        self._connected = False
        self._registered = False

        self._setup_events()

    # ──────────────────────────────────────────────
    # 公共 API
    # ──────────────────────────────────────────────

    async def connect(self) -> bool:
        """连接 Neural Core 并完成注册。返回是否成功。"""
        try:
            logger.info("[Neural] 正在连接 %s ...", NEURAL_WS_URL)
            await self._sio.connect(NEURAL_WS_URL, namespaces=["/neural"])
            return True
        except Exception as e:
            logger.error("[Neural] 连接失败: %s", e)
            return False

    async def disconnect(self):
        """断开连接。"""
        self._stop_heartbeat()
        if self._sio.connected:
            await self._sio.disconnect()
        self._connected = False
        self._registered = False
        logger.info("[Neural] 已断开")

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
        return self._connected and self._registered

    # ──────────────────────────────────────────────
    # Socket.IO 事件
    # ──────────────────────────────────────────────

    def _setup_events(self):
        sio = self._sio

        @sio.on("connect", namespace="/neural")
        async def on_connect():
            logger.info("[Neural] WS 已连接, sid: %s", self._sio.sid)
            self._connected = True
            # 连接后立即注册 Actor
            await self._register_actor()

        @sio.on("disconnect", namespace="/neural")
        async def on_disconnect():
            logger.warning("[Neural] WS 断开")
            self._connected = False
            self._registered = False
            self._stop_heartbeat()

        @sio.on("registered", namespace="/neural")
        async def on_registered(data):
            logger.info("[Neural] Actor 注册成功: %s", data)
            self._registered = True
            # 注册成功后注册 Capability + 订阅
            await self._register_capabilities()
            await self._subscribe_topics()
            self._start_heartbeat()

        @sio.on("capabilities_registered", namespace="/neural")
        async def on_capabilities_registered(data):
            logger.info("[Neural] Capability 注册成功: %s", data)

        @sio.on("subscribed", namespace="/neural")
        async def on_subscribed(data):
            logger.info("[Neural] 订阅成功: %s", data)

        @sio.on("heartbeat_ack", namespace="/neural")
        async def on_heartbeat_ack(data):
            pass  # 心跳确认

        @sio.on("message", namespace="/neural")
        async def on_message(data):
            """接收 Neural Core 路由过来的消息。"""
            kind = data.get("kind", "")
            topic = data.get("topic", "")
            payload = data.get("payload", {})

            if kind in ("command", "control") and self._on_command:
                logger.info("[Neural] 收到 command: topic=%s", topic)
                await self._on_command(data)
            else:
                logger.debug("[Neural] 收到消息: kind=%s, topic=%s", kind, topic)

    # ──────────────────────────────────────────────
    # 注册流程
    # ──────────────────────────────────────────────

    async def _register_actor(self):
        """注册 Actor 身份。"""
        await self._sio.emit(
            "register",
            {"actor": BODY_ACTOR},
            namespace="/neural",
        )
        logger.info("[Neural] 已发送 register: %s", BODY_ACTOR["actorId"])

    async def _register_capabilities(self):
        """注册能力列表。"""
        await self._sio.emit(
            "register_capabilities",
            {"capabilities": CAPABILITIES},
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
