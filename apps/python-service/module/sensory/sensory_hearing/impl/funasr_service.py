"""
FunASR Service Implementation
FunASR ASR 服务实现
"""
import asyncio
import logging
from typing import Any, Dict, Optional

import numpy as np

from ..base import ASRModelConfig, ASRModelType, BaseASRService

logger = logging.getLogger(__name__)


class FunAsrService(BaseASRService):
    """FunASR 语音识别服务"""

    def __init__(self, config: Optional[ASRModelConfig] = None, debug: bool = False):
        """
        初始化 FunASR 服务

        Args:
            config: 模型配置
            debug: 是否启用调试模式
        """
        # 兼容旧的初始化方式
        if config is None:
            config = ASRModelConfig(debug=debug)
        super().__init__(config)

        # FunASR 特有配置
        self.chunk_size = [0, 10, 5]  # 600ms latency
        # chunk_stride: 每个chunk的采样点数 (10 * 960 = 9600 samples = 600ms @ 16kHz)
        self.chunk_stride = self.chunk_size[1] * 960
        # 每个chunk的字节数 (16-bit PCM = 2 bytes per sample)
        self.chunk_bytes = self.chunk_stride * 2
        # 实时处理配置
        self.realtime_processing = True
        # 最小处理单元: 100ms @ 16kHz = 1600 样本 = 3200 字节
        self.min_process_bytes = 3200

    @property
    def model_type(self) -> ASRModelType:
        """获取模型类型"""
        return ASRModelType.FUNASR

    @property
    def default_model_name(self) -> str:
        """获取默认模型名称"""
        return "paraformer-zh-streaming"

    async def load_model(self, model_name: Optional[str] = None) -> None:
        """
        加载 FunASR 模型

        Args:
            model_name: 模型名称,默认使用 paraformer-zh-streaming
        """
        async with self._lock:
            target_model = model_name or self.default_model_name
            if self.model_loaded and target_model == self.config.model_name:
                logger.info(f"Model {self.config.model_name} already loaded")
                return

            try:
                from funasr import AutoModel

                logger.info(f"🚀 加载 FunASR 模型: {target_model}")

                # 在线程池中加载模型(避免阻塞事件循环)
                loop = asyncio.get_event_loop()
                self.model = await loop.run_in_executor(
                    None,
                    lambda: AutoModel(
                        model=target_model,
                        disable_pbar=True,
                        disable_log=not self.config.debug,
                        disable_update=True  # 禁用版本更新检查
                    )
                )

                self.config.model_name = target_model
                self.model_loaded = True
                logger.info(f"✅ 模型 {target_model} 加载成功")

            except Exception as e:
                logger.error(f"Failed to load model: {e}")
                raise

    async def transcribe_chunk(
        self,
        audio_data: bytes,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        转录音频块 - 流式识别版本

        Args:
            audio_data: 音频数据(PCM 格式)
            config: 转录配置

        Returns:
            转录结果字典
        """
        if not self.model_loaded:
            await self.load_model()

        try:
            # 获取或创建会话ID
            session_id = config.get('wav_name', 'default_session')

            # 获取或创建会话状态
            session = self.get_or_create_session(session_id)

            # 获取配置的输入采样率(默认24kHz)
            input_fs = config.get('audio_fs', self.input_sample_rate)

            # 重采样到16kHz (如果需要)
            if input_fs != self.target_sample_rate:
                audio_data = self.resample_audio(audio_data, input_fs, self.target_sample_rate)
                if self.config.debug:
                    logger.debug(f"Resampled from {input_fs}Hz to {self.target_sample_rate}Hz")

            # 累积音频数据到缓冲区
            session.audio_buffer.extend(audio_data)
            buffer_len = len(session.audio_buffer)

            if self.config.debug:
                logger.debug(f"Session {session_id}: buffer size = {buffer_len} bytes, chunk_bytes = {self.chunk_bytes}")

            # 如果缓冲区不足一个chunk,返回空结果(不调用模型)
            if buffer_len < self.chunk_bytes:
                return {
                    "success": True,
                    "text": "",
                    "mode": config.get('mode', '2pass'),
                    "wav_name": config.get('wav_name', 'audio'),
                    "is_final": False
                }

            # 提取一个完整的chunk
            chunk_data = bytes(session.audio_buffer[:self.chunk_bytes])
            # 保留剩余数据
            session.audio_buffer = session.audio_buffer[self.chunk_bytes:]

            # 将字节数据转换为numpy数组
            audio_array = np.frombuffer(chunk_data, dtype=np.int16).astype(np.float32)
            # 归一化到 [-1, 1]
            audio_array = audio_array / 32768.0

            if self.config.debug:
                logger.info(f"Session {session_id}: processing chunk of {len(audio_array)} samples ({len(audio_array)/16000:.2f}s)")

            # 在线程池中执行推理
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self.model.generate(
                    input=audio_array,
                    cache=session.cache,  # 传入会话cache,模型会更新它
                    is_final=False,  # 流式模式
                    chunk_size=self.chunk_size,
                    encoder_chunk_look_back=4,
                    decoder_chunk_look_back=1,
                    batch_size_s=300,
                    hotword=config.get('hotwords', '')
                )
            )

            # 解析结果
            if result and len(result) > 0:
                first_result = result[0]
                text = first_result.get("text", "") if isinstance(first_result, dict) else str(first_result)

                logger.info(f"Session {session_id}: recognized text = '{text}'")

                return {
                    "success": True,
                    "text": text,
                    "mode": config.get('mode', '2pass'),
                    "wav_name": config.get('wav_name', 'audio'),
                    "is_final": False
                }
            else:
                return {
                    "success": True,
                    "text": "",
                    "mode": config.get('mode', '2pass'),
                    "wav_name": config.get('wav_name', 'audio'),
                    "is_final": False
                }

        except Exception as e:
            logger.error(f"Transcription error: {e}", exc_info=True)
            return {
                "success": False,
                "text": "",
                "error": str(e)
            }

    async def transcribe_file(
        self,
        audio_path: str,
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            config: 转录配置

        Returns:
            转录结果字典
        """
        if not self.model_loaded:
            await self.load_model()

        try:
            import soundfile

            # 读取音频文件
            speech, sample_rate = soundfile.read(audio_path)

            # 在线程池中执行推理
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self.model.generate(
                    input=speech,
                    batch_size_s=300,
                    hotword=config.get('hotwords', '') if config else '',
                )
            )

            # 解析结果
            if result and len(result) > 0:
                first_result = result[0]
                text = first_result.get("text", "") if isinstance(first_result, dict) else str(first_result)
                timestamp = first_result.get("timestamp", []) if isinstance(first_result, dict) else []

                return {
                    "success": True,
                    "text": text,
                    "timestamp": timestamp,
                    "mode": "offline",
                    "wav_name": audio_path.split('/')[-1],
                    "is_final": True
                }
            else:
                return {
                    "success": False,
                    "text": "",
                    "error": "No transcription result"
                }

        except Exception as e:
            logger.error(f"File transcription error: {e}")
            return {
                "success": False,
                "text": "",
                "error": str(e)
            }

    async def finalize_session(
        self,
        session_id: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        结束会话,处理剩余缓冲区数据

        Args:
            session_id: 会话ID
            config: 转录配置

        Returns:
            最终转录结果
        """
        try:
            if session_id not in self.streaming_sessions:
                return {"success": True, "text": ""}

            session = self.streaming_sessions[session_id]
            remaining_data = bytes(session.audio_buffer)
            cache = session.cache

            final_text = ""
            if len(remaining_data) > 0:
                logger.info(f"Session {session_id}: finalizing with {len(remaining_data)} bytes remaining")

                # 转换为numpy数组
                audio_array = np.frombuffer(remaining_data, dtype=np.int16).astype(np.float32)
                audio_array = audio_array / 32768.0

                # 最后一次调用,使用 is_final=True
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    lambda: self.model.generate(
                        input=audio_array,
                        cache=cache,
                        is_final=True,  # 最终块
                        chunk_size=self.chunk_size,
                        encoder_chunk_look_back=4,
                        decoder_chunk_look_back=1,
                        batch_size_s=300,
                        hotword=config.get('hotwords', '')
                    )
                )

                if result and len(result) > 0:
                    first_result = result[0]
                    final_text = first_result.get("text", "") if isinstance(first_result, dict) else str(first_result)
                    logger.info(f"Session {session_id}: final text = '{final_text}'")

            # 清理会话
            self.cleanup_session(session_id)
            logger.info(f"Session {session_id} cleaned up")

            return {
                "success": True,
                "text": final_text
            }

        except Exception as e:
            logger.error(f"Error finalizing session {session_id}: {e}", exc_info=True)
            # 确保清理会话
            self.cleanup_session(session_id)
            return {
                "success": False,
                "text": "",
                "error": str(e)
            }
