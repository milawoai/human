"""
Qwen3-ASR Service Implementation
Qwen3-ASR 语音识别服务实现
"""
import asyncio
import logging
import platform
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from ..base import ASRModelConfig, ASRModelType, BaseASRService

logger = logging.getLogger(__name__)


def _is_macos() -> bool:
    """检测是否运行在 macOS 上"""
    return platform.system() == "Darwin"


def _get_best_device() -> str:
    """
    获取最佳设备配置

    注意：Qwen3-ASR-1.7B 模型较大，macOS MPS 可能内存不足
    - macOS: 使用 CPU（MPS 内存限制）
    - 其他平台: 尝试 CUDA，不可用则回退到 CPU

    Returns:
        设备字符串 ("cuda:0", "cpu")
    """
    if _is_macos():
        # 🔥 macOS 强制使用 CPU，因为 Qwen3-ASR-1.7B 在 MPS 上会 OOM
        logger.info("Using CPU for macOS (MPS may cause OOM with large models)")
        return "cpu"
    else:
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda:0"
            else:
                logger.info("CUDA not available, using CPU")
                return "cpu"
        except Exception as e:
            logger.warning(f"Error checking CUDA availability: {e}, using CPU")
            return "cpu"


def _is_apple_silicon() -> bool:
    """检测是否为 Apple Silicon (M1/M2/M3/M4)"""
    if not _is_macos():
        return False
    try:
        import subprocess
        result = subprocess.run(['sysctl', '-n', 'machdep.cpu.brand_string'],
                              capture_output=True, text=True)
        return 'Apple' in result.stdout
    except Exception:
        return False


def _should_use_vllm() -> bool:
    """
    判断是否应该使用 vLLM 后端

    vLLM 主要为 NVIDIA GPU 优化，在 macOS 上支持有限：
    - 需要 MPS (Metal) 支持，但仍处于实验阶段
    - 需要从源码编译
    - 性能可能不如直接使用 transformers

    Returns:
        True 如果应该使用 vLLM，False 则使用 transformers
    """
    # macOS 默认不使用 vLLM
    if _is_macos():
        logger.info("Detected macOS - using transformers backend for better compatibility")
        return False

    # 其他平台默认尝试 vLLM
    return True


class Qwen3ASRService(BaseASRService):
    """Qwen3-ASR 语音识别服务"""

    def __init__(self, config: Optional[ASRModelConfig] = None, debug: bool = False):
        """
        初始化 Qwen3-ASR 服务

        Args:
            config: 模型配置
            debug: 是否启用调试模式
        """
        if config is None:
            config = ASRModelConfig(debug=debug)
        super().__init__(config)

        # 自动检测是否使用 vLLM 后端
        # macOS 默认使用 transformers 后端以获得更好的兼容性
        self.use_vllm = _should_use_vllm()

        # Qwen3 特有配置
        self.chunk_duration = 0.6  # 600ms 音频块
        self.chunk_samples = int(self.chunk_duration * self.target_sample_rate)  # 9600 samples
        self.chunk_bytes = self.chunk_samples * 2  # 19200 bytes (16-bit PCM)

        # 流式会话的音频累积缓冲
        self._streaming_buffers: Dict[str, List[np.ndarray]] = {}

    @property
    def model_type(self) -> ASRModelType:
        """获取模型类型"""
        return ASRModelType.QWEN3

    @property
    def default_model_name(self) -> str:
        """获取默认模型名称"""
        return "Qwen/Qwen3-ASR-1.7B"

    async def load_model(self, model_name: Optional[str] = None) -> None:
        """
        加载 Qwen3-ASR 模型

        Args:
            model_name: 模型名称或路径
        """
        async with self._lock:
            target_model = model_name or self.config.model_path or self.default_model_name
            if self.model_loaded and target_model == self.config.model_name:
                logger.info(f"Model {self.config.model_name} already loaded")
                return

            try:

                backend_name = "vLLM" if self.use_vllm else "transformers"
                logger.info(f"🚀 加载 Qwen3-ASR 模型: {target_model} (backend: {backend_name})")

                # 在线程池中加载模型(避免阻塞事件循环)
                loop = asyncio.get_event_loop()

                if self.use_vllm:
                    # 使用 vLLM backend (支持流式推理)
                    self.model = await loop.run_in_executor(
                        None,
                        lambda: self._load_vllm_model(target_model)
                    )
                else:
                    # 使用 transformers backend (macOS 推荐使用 MPS)
                    self.model = await loop.run_in_executor(
                        None,
                        lambda: self._load_transformers_model(target_model)
                    )

                self.config.model_name = target_model
                self.model_loaded = True
                logger.info(f"✅ 模型 {target_model} 加载成功")

            except Exception as e:
                logger.error(f"Failed to load Qwen3-ASR model: {e}", exc_info=True)
                raise

    def _load_vllm_model(self, model_path: str):
        """加载 vLLM backend 模型"""
        try:
            from qwen_asr import Qwen3ASRModel
            import torch

            # 构建 forced aligner 配置
            aligner_path = self.config.aligner_path
            forced_aligner_kwargs = None
            if aligner_path:
                forced_aligner_kwargs = {
                    "dtype": getattr(torch, self.config.dtype, torch.bfloat16),
                    "device_map": self.config.device,
                }

            return Qwen3ASRModel.LLM(
                model=model_path,
                gpu_memory_utilization=self.config.gpu_memory_utilization,
                max_inference_batch_size=128,
                max_new_tokens=4096,
                forced_aligner=aligner_path,
                forced_aligner_kwargs=forced_aligner_kwargs,
            )
        except ImportError:
            logger.warning("vLLM backend not available, falling back to transformers")
            return self._load_transformers_model(model_path)

    def _load_transformers_model(self, model_path: str):
        """加载 transformers backend 模型"""
        from qwen_asr import Qwen3ASRModel
        import torch

        # 🔥 自动检测最佳设备 (macOS 使用 MPS，其他平台使用 CUDA/CPU)
        best_device = _get_best_device()
        logger.info(f"Loading model on device: {best_device}")

        # 确定数据类型 (MPS 和 CPU 使用 float32，CUDA 使用 bfloat16)
        if best_device == "mps":
            dtype = torch.float32  # MPS 对 bfloat16 支持有限
        elif best_device == "cpu":
            dtype = torch.float32
        else:
            dtype = getattr(torch, self.config.dtype, torch.bfloat16)

        # 构建 forced aligner 配置
        aligner_path = self.config.aligner_path
        forced_aligner_kwargs = None
        if aligner_path:
            forced_aligner_kwargs = {
                "dtype": dtype,
                "device_map": best_device,
            }

        model = Qwen3ASRModel.from_pretrained(
            model_path,
            dtype=dtype,
            device_map=best_device,
            max_inference_batch_size=32,
            max_new_tokens=256,
            forced_aligner=aligner_path,
            forced_aligner_kwargs=forced_aligner_kwargs,
        )

        # 🔥 预热模型：确保所有权重都加载到设备
        self._warmup_model(model)

        return model

    def _warmup_model(self, model):
        """
        预热模型：执行一次空推理确保所有权重加载完成

        这对于实时转录场景很重要，避免用户开始说话时模型还在加载
        """
        import numpy as np

        try:
            logger.info("🔥 Warming up model...")
            # 创建 0.5 秒的静音音频 (16kHz 采样率)
            sample_rate = 16000
            duration = 0.5
            silence = np.zeros(int(sample_rate * duration), dtype=np.float32)

            # 执行一次推理
            audio_input = (silence, sample_rate)
            model.transcribe(audio=audio_input, language="zh")

            logger.info("✅ Model warmup completed")
        except Exception as e:
            logger.warning(f"Model warmup failed (non-critical): {e}")
            # 预热失败不是致命错误，继续使用模型

    async def transcribe_chunk(
        self,
        audio_data: bytes,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        转录音频块 - 流式识别

        Qwen3-ASR 的流式推理通过累积音频块，然后定期进行识别实现

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

            # 获取配置的输入采样率
            input_fs = config.get('audio_fs', self.input_sample_rate)

            # 重采样到目标采样率 (如果需要)
            if input_fs != self.target_sample_rate:
                audio_data = self.resample_audio(audio_data, input_fs, self.target_sample_rate)
                if self.config.debug:
                    logger.debug(f"Resampled from {input_fs}Hz to {self.target_sample_rate}Hz")

            # 将音频数据转换为 numpy 数组并累积
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

            # 初始化流式缓冲区
            if session_id not in self._streaming_buffers:
                self._streaming_buffers[session_id] = []

            # 累积音频数据
            self._streaming_buffers[session_id].append(audio_array)
            session.audio_buffer.extend(audio_data)

            buffer_len = len(session.audio_buffer)

            if self.config.debug:
                logger.debug(f"Session {session_id}: buffer size = {buffer_len} bytes")

            # 如果缓冲区不足一个 chunk，返回空结果
            if buffer_len < self.chunk_bytes:
                return {
                    "success": True,
                    "text": "",
                    "mode": config.get('mode', '2pass'),
                    "wav_name": session_id,
                    "is_final": False
                }

            # 提取音频数据进行识别
            # 合并累积的音频
            combined_audio = np.concatenate(self._streaming_buffers[session_id])

            # 保留未处理的音频
            samples_to_process = (len(combined_audio) // self.chunk_samples) * self.chunk_samples
            audio_to_process = combined_audio[:samples_to_process]
            remaining_audio = combined_audio[samples_to_process:]

            # 更新缓冲区
            self._streaming_buffers[session_id] = [remaining_audio] if len(remaining_audio) > 0 else []
            session.audio_buffer = bytearray()  # 清空，因为我们使用 numpy 数组管理

            if self.config.debug:
                logger.info(f"Session {session_id}: processing {len(audio_to_process)} samples ({len(audio_to_process)/self.target_sample_rate:.2f}s)")

            # 在线程池中执行推理
            loop = asyncio.get_event_loop()
            language = config.get('language', None)  # 自动检测语言

            # qwen-asr 支持的输入格式: (np.ndarray, sample_rate) 元组
            audio_input = (audio_to_process, self.target_sample_rate)

            result = await loop.run_in_executor(
                None,
                lambda: self.model.transcribe(
                    audio=audio_input,
                    language=language,
                )
            )

            # 解析结果
            if result and len(result) > 0:
                first_result = result[0]
                text = first_result.text if hasattr(first_result, 'text') else str(first_result)
                detected_language = first_result.language if hasattr(first_result, 'language') else "unknown"

                logger.info(f"Session {session_id}: recognized text = '{text}', language = {detected_language}")

                return {
                    "success": True,
                    "text": text,
                    "mode": config.get('mode', '2pass'),
                    "wav_name": session_id,
                    "is_final": False,
                    "language": detected_language
                }
            else:
                return {
                    "success": True,
                    "text": "",
                    "mode": config.get('mode', '2pass'),
                    "wav_name": session_id,
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
            config = config or {}
            language = config.get('language', None)
            return_timestamps = config.get('return_timestamps', False)

            # 在线程池中执行推理
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self.model.transcribe(
                    audio=audio_path,
                    language=language,
                    return_time_stamps=return_timestamps,
                )
            )

            # 解析结果
            if result and len(result) > 0:
                first_result = result[0]
                text = first_result.text if hasattr(first_result, 'text') else str(first_result)
                detected_language = first_result.language if hasattr(first_result, 'language') else "unknown"
                timestamps = None
                if hasattr(first_result, 'time_stamps') and first_result.time_stamps:
                    timestamps = [[ts.start_time, ts.end_time, ts.text] for ts in first_result.time_stamps[0]] if first_result.time_stamps else None

                return {
                    "success": True,
                    "text": text,
                    "timestamp": timestamps,
                    "mode": "offline",
                    "wav_name": Path(audio_path).name,
                    "is_final": True,
                    "language": detected_language
                }
            else:
                return {
                    "success": False,
                    "text": "",
                    "error": "No transcription result"
                }

        except Exception as e:
            logger.error(f"File transcription error: {e}", exc_info=True)
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

            final_text = ""

            # 处理剩余的音频数据
            if session_id in self._streaming_buffers and len(self._streaming_buffers[session_id]) > 0:
                remaining_audio = np.concatenate(self._streaming_buffers[session_id])

                if len(remaining_audio) > 0:
                    logger.info(f"Session {session_id}: finalizing with {len(remaining_audio)} samples remaining")

                    # 在线程池中执行最后一次推理
                    loop = asyncio.get_event_loop()
                    language = config.get('language', None)

                    # qwen-asr 支持的输入格式: (np.ndarray, sample_rate) 元组
                    audio_input = (remaining_audio, self.target_sample_rate)

                    result = await loop.run_in_executor(
                        None,
                        lambda: self.model.transcribe(
                            audio=audio_input,
                            language=language,
                        )
                    )

                    if result and len(result) > 0:
                        first_result = result[0]
                        final_text = first_result.text if hasattr(first_result, 'text') else str(first_result)
                        logger.info(f"Session {session_id}: final text = '{final_text}'")

            # 清理会话
            self.cleanup_session(session_id)
            if session_id in self._streaming_buffers:
                del self._streaming_buffers[session_id]
            logger.info(f"Session {session_id} cleaned up")

            return {
                "success": True,
                "text": final_text
            }

        except Exception as e:
            logger.error(f"Error finalizing session {session_id}: {e}", exc_info=True)
            # 确保清理会话
            self.cleanup_session(session_id)
            if session_id in self._streaming_buffers:
                del self._streaming_buffers[session_id]
            return {
                "success": False,
                "text": "",
                "error": str(e)
            }

    def get_status(self) -> Dict[str, Any]:
        """获取服务状态"""
        status = super().get_status()
        status.update({
            "use_vllm": self.use_vllm,
            "backend": "vLLM" if self.use_vllm else "transformers",
            "platform": platform.system(),
            "is_apple_silicon": _is_apple_silicon() if _is_macos() else False,
            "aligner_path": self.config.aligner_path,
        })
        return status
