"""
Speech Recognition Controllers (支持 Online 和 Segment 双模式)
语音识别控制器 - VAD + Offline ASR 伪流式方案
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
from .streaming_session import StreamingMode, StreamingSession
from .vad_recording_session import VadRecordingSession, RecordingState

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

        # 流式会话管理
        self.streaming_sessions: dict[str, StreamingSession] = {}
        # 音频处理任务
        self.audio_tasks: dict[str, asyncio.Task] = {}

        # VAD 录音会话管理
        self.vad_recording_session: Optional[VadRecordingSession] = None
        self.vad_recording_lock = asyncio.Lock()  # 防止同时开启多个录音

        # KWS 管理器（用于 ASR/KWS 麦克风协调）
        self.kws_manager = kws_manager

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

        @self.router.websocket("/stream/vad")
        async def websocket_vad_recording(
            websocket: WebSocket,
            model_id: str = Query(default="funasr-nano", description="使用的模型 ID"),
            subtitle_mode: bool = Query(default=True, description="是否启用实时字幕（VAD模式），false为简单录音"),
            save_dir: Optional[str] = Query(default=None, description="录音保存目录")
        ):
            """
            服务端录音 + VAD 分段识别 WebSocket

            流程:
            1. 客户端开启长链
            2. 服务端返回准备启动，并挂锁
            3. 服务端返回加载模型成功
            4. 服务端返回开始录音
            5. VAD 检测开始说话 → 返回 vad_start + 文件开始时间
            6. VAD 检测结束说话 → 返回 vad_end + 文件路径 + 时间范围
            7. 服务端返回识别文本
            8. 客户端发送关闭 → 服务端关闭录音，解锁

            消息协议:
            - 服务端主动发送:
              - {"type": "prepared", "message": "..."}  准备完成
              - {"type": "error", "error": "...", "message": "..."}  错误
              - {"type": "started", "session_id": "...", "sample_rate": 16000}  开始录音
              - {"type": "vad_start", "segment_id": "...", "start_time": 0.0}  检测到说话
              - {"type": "vad_end", "segment_id": "...", "segments_count": 1}  说话结束
              - {"type": "segment_ready", "segment_id": "...", "file_path": "...", "start_time": 0.0, "end_time": 1.5, "duration": 1.5, "text": "..."}  片段识别完成
              - {"type": "stopped", "segments_count": N, "full_recording": "/path/to/recording.wav"}  录音已停止
              - {"type": "closed"}  连接已关闭

            - 客户端发送:
              - {"type": "prepare"}  准备（加载模型、初始化 VAD）
              - {"type": "start", "save_audio": true}  开始录音（save_audio: 是否保存完整录音）
              - {"type": "stop"}  停止录音
              - {"type": "heartbeat"}  心跳保活（客户端每1秒发送，10秒无心跳自动停止）
            """
            await websocket.accept()
            session_id = str(uuid.uuid4())
            session: Optional[VadRecordingSession] = None
            kws_was_paused_by_asr = False

            print(f"[DEBUG] VAD WebSocket connection accepted: {session_id}")

            # 心跳保活
            HEARTBEAT_TIMEOUT = 10.0  # 10秒无心跳自动停止
            # 连接后立即检查是否有录音会话在运行
            print(f"[DEBUG] Checking existing session: {self.vad_recording_session}")
            if self.vad_recording_session and self.vad_recording_session.state == RecordingState.RECORDING:
                await websocket.send_json({
                    "type": "error",
                    "error": "busy",
                    "message": "Another recording is in progress"
                })
                await websocket.close()
                return

            async def send_event(event: dict):
                """发送事件给客户端"""
                try:
                    await websocket.send_json(event)
                except Exception as e:
                    logger.error(f"Error sending event: {e}")

            async def cleanup_session():
                """清理会话"""
                if session:
                    await session.stop()
                    session.cleanup()
                if self.vad_recording_session and self.vad_recording_session.session_id == session_id:
                    self.vad_recording_session = None

            try:
                # 进入锁
                print(f"[DEBUG] Waiting for vad_recording_lock: {session_id}")
                async with self.vad_recording_lock:
                    print(f"[DEBUG] Acquired vad_recording_lock: {session_id}")
                    # 等待客户端指令
                    while True:
                        try:
                            # 使用 asyncio.wait_for 实现心跳超时检测
                            try:
                                data = await asyncio.wait_for(
                                    websocket.receive_text(),
                                    timeout=HEARTBEAT_TIMEOUT
                                )
                                msg = json.loads(data)
                            except asyncio.TimeoutError:
                                # 心跳超时
                                logger.warning(f"Heartbeat timeout for session {session_id}")
                                await send_event({
                                    "type": "error",
                                    "error": "heartbeat_timeout",
                                    "message": f"No heartbeat received for {HEARTBEAT_TIMEOUT} seconds"
                                })
                                await cleanup_session()
                                break

                        except WebSocketDisconnect:
                            logger.info(f"VAD recording WebSocket disconnected: {session_id}")
                            await cleanup_session()
                            break

                        msg_type = msg.get("type", "")

                        if msg_type == "heartbeat":
                            continue

                        elif msg_type == "prepare":
                            # 准备阶段：加载模型、初始化 VAD

                            # 协调 KWS：如果 KWS 正在运行，先暂停它释放麦克风
                            if self.kws_manager and self.kws_manager.is_running():
                                try:
                                    await self.kws_manager.pause("asr_recording")
                                    kws_was_paused_by_asr = True
                                    logger.info("ASR prepare: 已暂停 KWS 释放麦克风")
                                except Exception as e:
                                    logger.warning(f"ASR prepare: 暂停 KWS 失败: {e}")

                            session = VadRecordingSession(session_id=session_id)

                            # 将字符串参数转换为布尔值
                            if isinstance(subtitle_mode, str):
                                subtitle_mode = subtitle_mode.lower() == "true"

                            # 保存最终目录（不覆盖 record_dir，segment 仍保存在临时目录）
                            session.save_dir = save_dir

                            success = await session.prepare(
                                self.asr_service,
                                send_event,
                                subtitle_mode=subtitle_mode
                            )
                            if success:
                                self.vad_recording_session = session
                                print(f"[DEBUG] prepare success: session={session}, session_id={session_id}, subtitle_mode={subtitle_mode}")
                                logger.info(f"VAD recording session prepared: {session_id}, subtitle_mode={subtitle_mode}")
                            else:
                                await websocket.close()
                                return

                        elif msg_type == "start":
                            # 开始录音
                            print(f"[DEBUG] start received: session={session}, session_id={session_id}")
                            if not session:
                                await send_event({
                                    "type": "error",
                                    "message": "Please send 'prepare' first"
                                })
                                continue

                            # 设置是否保存完整录音
                            save_audio = msg.get("save_audio", False)
                            session.save_audio = save_audio

                            await session.start()
                            logger.info(f"VAD recording started: {session_id}, save_audio={save_audio}, subtitle_mode={subtitle_mode}")

                        elif msg_type == "stop":
                            # 停止录音
                            if session:
                                await session.stop()
                                logger.info(f"VAD recording stopped: {session_id}")
                            break

                        else:
                            await send_event({
                                "type": "error",
                                "message": f"Unknown message type: {msg_type}"
                            })

            except Exception as e:
                print(f"[DEBUG] VAD recording WebSocket exception: {e}")
                logger.error(f"VAD recording WebSocket error: {e}")
                try:
                    await send_event({
                        "type": "error",
                        "message": str(e)
                    })
                except Exception:
                    pass
            finally:
                # 清理
                if session:
                    session.cleanup()
                if self.vad_recording_session and self.vad_recording_session.session_id == session_id:
                    self.vad_recording_session = None

                # 恢复 KWS（如果 ASR 之前暂停了它）
                if kws_was_paused_by_asr and self.kws_manager and self.kws_manager.is_paused():
                    try:
                        await self.kws_manager.resume()
                        logger.info("ASR 结束，已自动恢复 KWS 监听")
                    except Exception as e:
                        logger.error(f"恢复 KWS 失败: {e}")

                try:
                    await websocket.send_json({"type": "closed"})
                    await websocket.close()
                except Exception:
                    pass

                logger.info(f"VAD recording session cleaned up: {session_id}")

    def get_router(self) -> APIRouter:
        """获取路由器"""
        return self.router
