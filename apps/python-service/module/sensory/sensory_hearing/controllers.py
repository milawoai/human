"""
Speech Recognition Controllers (支持 Online 和 Segment 双模式)
语音识别控制器 - VAD + Offline ASR 伪流式方案

注意：VAD 服务端录音模式已迁移至 Neural Core 通信架构，
不再通过 /asr/stream/vad 直连，改为通过 Neural Bus 收发消息。
"""
import asyncio
import base64
import json
import logging
import os
import tempfile
import uuid
from typing import Optional, Tuple

import numpy as np
from fastapi import APIRouter, File, Query, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from .config import get_config
from .impl.sherpa_onnx_funasr_service import SherpaOnnxFunasrService
from .neural_adapter import NeuralAdapter
from .neural_client import NeuralClient
from .query_router import router as query_router, set_adapter as set_query_adapter
from .streaming_session import StreamingMode, StreamingSession

logger = logging.getLogger(__name__)


async def _save_recorded_audio(session: StreamingSession) -> Tuple[Optional[str], float]:
    """
    保存录音为 WAV 文件

    Returns:
        (file_path, duration) 或 (None, 0.0) 如果保存失败
    """
    audio_data = session.get_recorded_audio()
    if audio_data is None or len(audio_data) == 0:
        return None, 0.0

    try:
        import soundfile as sf

        # 生成文件名
        filename = f"recording_{session.session_id}.wav"
        # 优先使用配置的录音目录，否则用临时目录
        record_dir = getattr(session, 'record_dir', None) or tempfile.gettempdir()
        file_path = os.path.join(record_dir, filename)

        # 保存为 WAV
        sf.write(file_path, audio_data, session.sample_rate)

        duration = len(audio_data) / session.sample_rate
        return file_path, duration

    except Exception as e:
        logger.error(f"Failed to save recording: {e}")
        return None, 0.0


class LoadModelRequest(BaseModel):
    """加载模型的请求"""
    model_id: str = Field(..., description="模型 ID")
    model_type: Optional[str] = Field(default="sherpa-onnx", description="模型类型")


class SpeechRecognitionController:
    """语音识别控制器 - 支持 Online/Segment 双模式"""

    def __init__(self, debug: bool = False, kws_manager=None):
        self.debug = debug
        self.config = get_config()

        # 初始化服务
        self.asr_service = SherpaOnnxFunasrService()

        # 流式会话管理（客户端推音频模式）
        self.streaming_sessions: dict[str, StreamingSession] = {}
        # 音频处理任务
        self.audio_tasks: dict[str, asyncio.Task] = {}

        # KWS 管理器（用于 ASR/KWS 麦克风协调）
        self.kws_manager = kws_manager

        # Neural Core 客户端（VAD 录音模式通过 Neural Bus 通信）
        self.neural_client: Optional[NeuralClient] = None
        self.neural_adapter: Optional[NeuralAdapter] = None

        self.router = APIRouter(prefix="/asr", tags=["ASR 全局服务"])
        self._setup_routes()

    def _setup_routes(self):
        """设置路由"""

        @self.router.get("/models")
        async def get_models():
            """获取支持的模型列表"""
            models = [
                {
                    "id": m.id,
                    "model_path": m.model_path,
                    "can_streaming": m.can_streaming,
                    "engine": m.engine,
                    "category": m.category.value if hasattr(m.category, 'value') else str(m.category)
                }
                for m in self.config.model_registry.values()
            ]
            return {
                "success": True,
                "total": len(models),
                "models": models
            }

        @self.router.get("/status")
        async def get_status():
            """获取当前服务状态"""
            return {
                "success": True,
                "current_model_id": self.asr_service.current_model_id,
                "is_online_mode_supported": self.asr_service.is_online_mode_supported(),
                "active_sessions": len(self.streaming_sessions)
            }

        @self.router.post("/transcribe")
        async def transcribe_file(
            file: UploadFile = File(..., description="音频文件"),
            model_id: str = Query(..., description="模型 ID")
        ):
            """离线文件转录 (REST API)"""
            try:
                # 1. 加载模型
                success = await self.asr_service.load_model(model_id)
                if not success:
                    return {"success": False, "error": f"Failed to load model {model_id}"}

                # 2. 保存临时文件
                temp_filename = f"temp_{uuid.uuid4()}.wav"
                temp_path = os.path.join("/tmp", temp_filename)
                with open(temp_path, "wb") as f:
                    content = await file.read()
                    f.write(content)

                # 3. 转录
                result = await self.asr_service.transcribe_file(temp_path)

                # 4. 清理
                if os.path.exists(temp_path):
                    os.remove(temp_path)

                return result
            except Exception as e:
                logger.error(f"Transcription failed: {e}")
                return {"success": False, "error": str(e)}

        @self.router.websocket("/stream")
        async def websocket_asr_stream(
            websocket: WebSocket,
            model_id: str = Query(..., description="使用的模型 ID")
        ):
            """
            实时流式 ASR WebSocket

            消息协议:
            1. 客户端发送 {"type": "start", "mode": "segment"}  开始会话
            2. 客户端发送 {"type": "audio", "data": "<base64 pcm>"}  发送音频
            3. 客户端发送 {"type": "stop"}  结束会话

            服务端返回:
            - {"type": "started", "mode": "segment"}  会话开始
            - {"type": "vad_start"}  检测到说话开始
            - {"type": "vad_end"}  检测到说话结束
            - {"type": "partial", "text": "..."}  部分结果
            - {"type": "final", "text": "..."}  最终结果
            - {"type": "error", "message": "..."}  错误
            """
            await websocket.accept()
            session_id = str(uuid.uuid4())
            session: Optional[StreamingSession] = None

            try:
                # 1. 加载模型
                success = await self.asr_service.load_model(model_id)
                if not success:
                    await websocket.send_json({
                        "type": "error",
                        "error": "model_load_failed",
                        "message": f"Failed to load model {model_id}"
                    })
                    await websocket.close()
                    return

                # 2. 消息循环
                while True:
                    try:
                        data = await websocket.receive_text()
                        msg = json.loads(data)
                    except WebSocketDisconnect:
                        logger.info(f"WebSocket disconnected: {session_id}")
                        break
                    except json.JSONDecodeError:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Invalid JSON"
                        })
                        continue

                    msg_type = msg.get("type", "")

                    if msg_type == "start":
                        # 开始会话
                        mode_str = msg.get("mode", "auto")
                        try:
                            mode = StreamingMode(mode_str)
                        except ValueError:
                            mode = StreamingMode.AUTO

                        # 检查模式兼容性
                        if mode == StreamingMode.ONLINE and not self.asr_service.is_online_mode_supported():
                            # 不支持 online 模式，自动降级到 segment
                            logger.info("Online mode not supported, falling back to segment mode")
                            mode = StreamingMode.SEGMENT

                        session = self.asr_service.create_streaming_session(
                            session_id=session_id,
                            mode=mode,
                            on_result=lambda r: asyncio.create_task(
                                websocket.send_json(r)
                            )
                        )
                        self.streaming_sessions[session_id] = session

                        # 设置是否保存录音
                        save_audio = msg.get("save_audio", False)
                        session.set_save_audio(save_audio)

                        await websocket.send_json({
                            "type": "started",
                            "session_id": session_id,
                            "mode": mode.value,
                            "model_id": model_id,
                            "save_audio": save_audio
                        })

                    elif msg_type == "audio":
                        # 接收音频
                        if not session:
                            await websocket.send_json({
                                "type": "error",
                                "message": "Session not started"
                            })
                            continue

                        try:
                            audio_data = base64.b64decode(msg.get("data", ""))
                            audio_array = np.frombuffer(audio_data, dtype=np.float32)

                            # 保存录音（如果启用）
                            session.add_recorded_audio(audio_array)

                            # 处理音频
                            results = await self.asr_service.process_streaming_session(
                                session, audio_array
                            )

                            # 发送结果
                            for result in results:
                                await websocket.send_json({
                                    "session_id": session_id,
                                    **result
                                })

                        except Exception as e:
                            logger.error(f"Audio processing error: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": str(e)
                            })

                    elif msg_type == "stop":
                        # 结束会话
                        audio_file = None
                        audio_duration = 0.0

                        if session:
                            # 处理剩余音频
                            if session.get_buffered_audio() is not None:
                                buffered_audio = session.get_buffered_audio()
                                if buffered_audio is not None and len(buffered_audio) > 0:
                                    final_text = await self.asr_service._transcribe_offline_segment(
                                        buffered_audio
                                    )
                                    if final_text:
                                        await websocket.send_json({
                                            "session_id": session_id,
                                            "type": "final",
                                            "text": final_text
                                        })

                            # 保存录音（如果启用）
                            if session.save_audio and session.recorded_audio:
                                audio_file, audio_duration = await _save_recorded_audio(session)
                                if audio_file:
                                    logger.info(f"Saved recording: {audio_file} ({audio_duration:.2f}s)")

                            await websocket.send_json({
                                "type": "stopped",
                                "session_id": session_id,
                                "audio_file": audio_file,
                                "audio_duration": round(audio_duration, 2)
                            })
                        break

                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Unknown message type: {msg_type}"
                        })

            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                try:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e)
                    })
                except Exception:
                    pass
            finally:
                # 清理会话
                if session_id in self.streaming_sessions:
                    del self.streaming_sessions[session_id]
                if session_id in self.audio_tasks:
                    task = self.audio_tasks.pop(session_id)
                    task.cancel()

    # ──────────────────────────────────────────────
    # Neural Core 连接管理
    # ──────────────────────────────────────────────

    async def start_neural(self):
        """启动 Neural Core 连接（应在 FastAPI startup 事件中调用）。"""
        if self.neural_client is not None:
            logger.warning("[Controller] Neural 客户端已存在")
            return

        self.neural_client = NeuralClient()
        self.neural_adapter = NeuralAdapter(self.neural_client, self.asr_service)

        # 将 adapter 的 handle_command 设置为 Neural 客户端的 command 回调
        self.neural_client._on_command = self.neural_adapter.handle_command

        # 注入 adapter 到 query_router，供 HTTP query 端点使用
        set_query_adapter(self.neural_adapter)

        success = await self.neural_client.connect()
        if success:
            logger.info("[Controller] Neural Core 连接成功，sensory-hearing Actor 已注册")
        else:
            logger.error("[Controller] Neural Core 连接失败")

    async def stop_neural(self):
        """停止 Neural Core 连接（应在 FastAPI shutdown 事件中调用）。"""
        if self.neural_client:
            await self.neural_client.disconnect()
            self.neural_client = None
            self.neural_adapter = None
            logger.info("[Controller] Neural Core 已断开")

    def get_router(self) -> APIRouter:
        """获取路由器"""
        return self.router
