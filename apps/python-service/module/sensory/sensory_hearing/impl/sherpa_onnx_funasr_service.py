"""
Sherpa-ONNX FunASR Service Implementation
基于 Sherpa-ONNX 的 FunASR 系列模型服务实现
支持: FunASR-Nano, SenseVoice 等 FunASR 衍生的 ONNX 模型
"""
import os
import numpy as np
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import sherpa_onnx
except ImportError:
    print("Warning: sherpa-onnx not installed. Please install it with 'pip install sherpa-onnx'")
    sherpa_onnx = None

from ..base import ASRServiceCategory, ASRModelConfig, ASRModelType, BaseASRService
from ..config import get_config
from ..streaming_session import StreamingSession, StreamingMode, VadState


class SherpaOnnxFunasrService(BaseASRService):
    """基于 Sherpa-ONNX 的 FunASR 系列模型服务实现"""

    # VAD 模型路径 (可配置)
    DEFAULT_VAD_MODEL = "/Users/zhou/Downloads/model/audio/onnx/silero_vad.onnx"

    def __init__(self, config: Optional[ASRModelConfig] = None, debug: bool = False):
        """
        初始化 Sherpa-ONNX FunASR 服务

        Args:
            config: 模型配置
            debug: 是否启用调试模式
        """
        # 兼容旧的初始化方式
        if config is None:
            config = ASRModelConfig(debug=debug)
        super().__init__(config)
        self.app_config = get_config()
        self.offline_recognizer: Optional[sherpa_onnx.OfflineRecognizer] = None
        self.online_recognizer: Optional[sherpa_onnx.OnlineRecognizer] = None
        self.current_model_id: Optional[str] = None

        # VAD 相关
        self.vad_config: Optional[sherpa_onnx.VadModelConfig] = None
        self._init_vad()

    @property
    def model_type(self) -> ASRModelType:
        return ASRModelType.FUNASR

    @property
    def service_category(self) -> ASRServiceCategory:
        """服务分类标识"""
        return ASRServiceCategory.SHERPA_ONNX_FUNASR

    @property
    def default_model_name(self) -> str:
        """获取默认模型名称"""
        return "sherpa-onnx-funasr"

    async def load_model(self, model_id: str) -> bool:
        """加载指定的 Sherpa-ONNX FunASR 模型"""
        if not sherpa_onnx:
            return False

        if model_id == self.current_model_id and (self.online_recognizer or self.offline_recognizer):
            return True

        model_info = self.app_config.model_registry.get(model_id)
        if not model_info:
            print(f"Model ID {model_id} not found in registry.")
            return False

        # 验证模型分类
        if model_info.category != ASRServiceCategory.SHERPA_ONNX_FUNASR:
            print(f"Model {model_id} category mismatch. Expected {ASRServiceCategory.SHERPA_ONNX_FUNASR}, got {model_info.category}")
            return False

        model_path = Path(model_info.model_path)

        try:
            if model_info.can_streaming:
                self._load_online_model(model_path)
            else:
                self._load_offline_model(model_path)

            self.current_model_id = model_id
            model_type = "streaming" if model_info.can_streaming else "non-streaming"
            print(f"Successfully loaded Sherpa-ONNX FunASR model: {model_id} ({model_type})")
            return True
        except Exception as e:
            print(f"Failed to load model {model_id}: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _load_online_model(self, model_dir: Path):
        """加载流式模型 (Online) - Transducer 架构"""
        # 自动发现核心文件
        encoder = next(model_dir.glob("**/encoder*.onnx"))
        decoder = next(model_dir.glob("**/decoder*.onnx"))
        joiner = next(model_dir.glob("**/joiner*.onnx"))
        tokens = next(model_dir.glob("**/tokens.txt"))

        feat_config = sherpa_onnx.FeatureConfig(
            sample_rate=16000,
            feature_dim=80,
        )

        model_config = sherpa_onnx.OnlineModelConfig(
            transducer=sherpa_onnx.OnlineTransducerModelConfig(
                encoder=str(encoder),
                decoder=str(decoder),
                joiner=str(joiner),
            ),
            tokens=str(tokens),
            num_threads=4,
            provider="cpu",  # 后续可根据配置改为 cuda
            debug=False,
        )

        config = sherpa_onnx.OnlineRecognizerConfig(
            feat_config=feat_config,
            model_config=model_config,
            decoding_method="greedy_search",
            max_active_paths=4,
        )

        self.online_recognizer = sherpa_onnx.OnlineRecognizer(config)
        self.offline_recognizer = None

    def _load_offline_model(self, model_dir: Path):
        """加载离线模型 (Offline) - 支持多种 FunASR 衍生机型"""

        # ========== FunASR-Nano 系列模型检测 ==========
        # FunASR-Nano 特征文件:
        #   - encoder_adaptor.onnx / encoder_adaptor.int8.onnx
        #   - llm.onnx / llm.fp32.onnx / llm.fp16.onnx / llm.int8.onnx
        #   - embedding.onnx / embedding.int8.onnx
        encoder_adaptor = model_dir / "encoder_adaptor.onnx"
        encoder_adaptor_int8 = model_dir / "encoder_adaptor.int8.onnx"
        llm_model = model_dir / "llm.onnx"
        llm_fp32 = model_dir / "llm.fp32.onnx"
        llm_fp16 = model_dir / "llm.fp16.onnx"
        llm_int8 = model_dir / "llm.int8.onnx"
        embedding = model_dir / "embedding.onnx"
        embedding_int8 = model_dir / "embedding.int8.onnx"
        tokenizer_dir = model_dir / "Qwen3-0.6B"

        # 检查是否是 FunASR-Nano 系列
        has_encoder = encoder_adaptor.exists() or encoder_adaptor_int8.exists()
        has_embedding = embedding.exists() or embedding_int8.exists()
        has_llm = llm_model.exists() or llm_fp32.exists() or llm_fp16.exists() or llm_int8.exists()

        if has_encoder and has_llm and has_embedding:
            # FunASR-Nano 系列模型：使用专门的工厂方法
            # 优先使用量化版本
            encoder_path = str(encoder_adaptor_int8) if encoder_adaptor_int8.exists() else str(encoder_adaptor)
            embedding_path = str(embedding_int8) if embedding_int8.exists() else str(embedding)

            # 选择 LLM 文件
            if llm_int8.exists():
                llm_path = str(llm_int8)
            elif llm_fp16.exists():
                llm_path = str(llm_fp16)
            elif llm_fp32.exists():
                llm_path = str(llm_fp32)
            else:
                llm_path = str(llm_model)

            self.offline_recognizer = sherpa_onnx.OfflineRecognizer.from_funasr_nano(
                encoder_adaptor=encoder_path,
                llm=llm_path,
                embedding=embedding_path,
                tokenizer=str(tokenizer_dir),
                num_threads=4,
                provider="cpu",
                debug=False,
            )
            self.online_recognizer = None
            return

        # ========== 其他离线模型检测 ==========

        # 尝试识别是否为 Whisper
        whisper_encoder = model_dir / "encoder.onnx"
        whisper_decoder = model_dir / "decoder.onnx"
        if whisper_encoder.exists() and whisper_decoder.exists():
            tokens = next(model_dir.glob("**/tokens.txt"), None)
            if tokens:
                self.offline_recognizer = sherpa_onnx.OfflineRecognizer.from_whisper(
                    encoder=str(whisper_encoder),
                    decoder=str(whisper_decoder),
                    tokens=str(tokens),
                    num_threads=4,
                    provider="cpu",
                )
                self.online_recognizer = None
                return

        # 尝试识别是否为 SenseVoice (单模型文件)
        sense_voice_model = next(model_dir.glob("**/model.onnx"), None)
        if sense_voice_model:
            tokens = next(model_dir.glob("**/tokens.txt"), None)
            if tokens:
                self.offline_recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
                    model=str(sense_voice_model),
                    tokens=str(tokens),
                    num_threads=4,
                    use_itn=True,
                    provider="cpu",
                )
                self.online_recognizer = None
                return

        # 尝试识别是否为 Paraformer
        paraformer_model = next(model_dir.glob("**/*.onnx"), None)
        tokens = next(model_dir.glob("**/tokens.txt"), None)
        if paraformer_model and tokens:
            # Paraformer 通常只有单个 onnx 文件
            self.offline_recognizer = sherpa_onnx.OfflineRecognizer.from_paraformer(
                model=str(paraformer_model),
                tokens=str(tokens),
                num_threads=4,
                provider="cpu",
            )
            self.online_recognizer = None
            return

        raise ValueError(f"Unsupported FunASR model format in {model_dir}")

    def _ensure_model_loaded(self) -> bool:
        """确保模型已加载"""
        if self.offline_recognizer or self.online_recognizer:
            return True
        if self.current_model_id:
            return True
        # 尝试加载默认模型
        if "funasr-nano" in self.app_config.model_registry:
            return self.app_config.model_registry["funasr-nano"]
        return False

    async def transcribe_chunk(
        self,
        audio_data: bytes,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        转录音频块 - 流式识别（同步实现）
        注意: FunASR-Nano 主要用于离线转录，流式需要 VAD 前处理
        """
        if not self.online_recognizer:
            return {
                "success": False,
                "error": "Online recognizer not loaded. FunASR-Nano is for offline transcription."
            }

        audio_array = np.frombuffer(audio_data, dtype=np.float32)
        session_id = config.get("session_id", "default")
        text = self._process_streaming_chunk(session_id, audio_array)
        return {
            "success": True,
            "text": text,
            "is_final": False
        }

    def _process_streaming_chunk(self, session_id: str, audio_chunk: np.ndarray) -> str:
        """处理流式音频块，返回中间结果"""
        if not self.online_recognizer:
            return ""

        stream = self._get_or_create_online_stream(session_id)
        stream.accept_waveform(16000, audio_chunk)

        while self.online_recognizer.is_ready(stream):
            self.online_recognizer.decode_stream(stream)

        return self.online_recognizer.get_result(stream).text

    async def finalize_session(
        self,
        session_id: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """结束会话，处理剩余缓冲区数据"""
        if self.online_recognizer:
            stream = self._get_or_create_online_stream(session_id)
            self.online_recognizer.decode_stream(stream)
            result = self.online_recognizer.get_result(stream)
            self.online_recognizer.reset(stream)
            return {
                "success": True,
                "text": result.text,
                "is_final": True
            }
        return {"success": False, "error": "No active recognizer"}

    def _get_or_create_online_stream(self, session_id: str):
        """管理会话对应的 OnlineStream"""
        session = self.get_or_create_session(session_id)
        if not hasattr(session, 'sherpa_stream') or session.sherpa_stream is None:
            if not self.online_recognizer:
                raise RuntimeError("Online recognizer not initialized")
            session.sherpa_stream = self.online_recognizer.create_stream()
        return session.sherpa_stream

    async def transcribe_file(self, file_path: str, max_duration_for_direct: float = 300.0) -> Dict[str, Any]:
        """
        转录完整音频文件

        Args:
            file_path: 音频文件路径
            max_duration_for_direct: 直接转录的最大时长（秒），默认 300秒(5分钟)
                                   超过此值则使用分段转录
        """
        if not self.offline_recognizer:
            # 尝试自动加载
            if not self.current_model_id and self.app_config.model_registry:
                first_model = next(iter(self.app_config.model_registry.keys()))
                await self.load_model(first_model)

            if not self.offline_recognizer:
                return {"success": False, "error": "Offline recognizer not loaded"}

        import soundfile as sf
        audio, sample_rate = sf.read(file_path)

        # 如果是多声道，转单声道
        if len(audio.shape) > 1:
            audio = audio.mean(axis=1)

        # 采样率转换 (sherpa-onnx 离线通常需要 16k)
        if sample_rate != 16000:
            from scipy import signal
            audio = signal.resample(audio, int(len(audio) * 16000 / sample_rate))

        audio_duration = len(audio) / 16000.0

        # 判断是否需要分段
        if audio_duration <= max_duration_for_direct:
            # 直接转录（快速路径）
            return await self._transcribe_direct(audio)
        else:
            # 分段转录（处理长音频）
            return await self._transcribe_with_segments(audio, audio_duration)

    async def _transcribe_direct(self, audio: np.ndarray) -> Dict[str, Any]:
        """直接转录（不分割）"""
        stream = self.offline_recognizer.create_stream()
        stream.accept_waveform(16000, audio.astype(np.float32))

        self.offline_recognizer.decode_stream(stream)
        result = stream.result

        return {
            "success": True,
            "text": result.text if hasattr(result, 'text') else "",
            "segments": self._format_segments_with_time(result, 0.0, len(audio) / 16000.0)
        }

    async def _transcribe_with_segments(self, audio: np.ndarray, audio_duration: float) -> Dict[str, Any]:
        """
        分段转录（处理长音频）

        策略：
        1. 使用 VAD 找静音点分割
        2. 相邻段落重叠 1 秒
        3. 转录后用重叠文本匹配去重合并
        """
        if not self.vad_config:
            # 没有 VAD，降级为直接转录（可能内存占用高）
            print("Warning: VAD not configured, falling back to direct transcription")
            return await self._transcribe_direct(audio)

        # 1. VAD 分割
        segments_info = self._vad_segmentation(audio, audio_duration)

        if not segments_info:
            # VAD 未能分割，降级
            return await self._transcribe_direct(audio)

        # 2. 重叠转录
        overlap_seconds = 1.0
        all_texts = []
        all_segments = []

        for i, (start_time, end_time) in enumerate(segments_info):
            # 扩展边界以产生重叠
            extend_start = max(0.0, start_time - overlap_seconds)
            extend_end = min(audio_duration, end_time + overlap_seconds)

            start_sample = int(extend_start * 16000)
            end_sample = int(extend_end * 16000)
            segment_audio = audio[start_sample:end_sample]

            # 转录
            text = await self._transcribe_segment(segment_audio)
            all_texts.append(text)

            # 记录（使用原始时间戳，不是扩展后的）
            all_segments.append({
                "index": i + 1,
                "start": round(start_time, 2),
                "end": round(end_time, 2),
                "text": text
            })

        # 3. 重叠文本修正合并
        merged_texts = self._merge_overlap_texts(all_texts, overlap_seconds)

        # 4. 构建最终文本
        final_text = " ".join(merged_texts)

        return {
            "success": True,
            "text": final_text,
            "segments": all_segments,
            "transcription_mode": "segmented",
            "original_duration": round(audio_duration, 2)
        }

    def _vad_segmentation(self, audio: np.ndarray, audio_duration: float) -> List[tuple]:
        """
        使用 VAD 进行音频分割

        Returns:
            List of (start_time, end_time) tuples for each speech segment
        """
        try:
            vad = sherpa_onnx.VoiceActivityDetector(
                self.vad_config,
                buffer_size_in_seconds=30
            )

            # 喂入音频
            vad.accept_waveform(audio)

            segments = []
            while not vad.empty():
                segment = vad.front
                vad.pop()
                if segment.is_speech:
                    start_sample = segment.styles.start_sample
                    end_sample = start_sample + len(segment.samples)
                    start_time = start_sample / 16000.0
                    end_time = end_sample / 16000.0

                    # 过滤太短的片段（< 0.3秒）
                    if end_time - start_time >= 0.3:
                        segments.append((start_time, end_time))

            return segments

        except Exception as e:
            print(f"VAD segmentation failed: {e}")
            return []

    async def _transcribe_segment(self, audio: np.ndarray) -> str:
        """转录单个音频段落"""
        if not self.offline_recognizer:
            return ""

        try:
            stream = self.offline_recognizer.create_stream()
            stream.accept_waveform(16000, audio.astype(np.float32))
            self.offline_recognizer.decode_stream(stream)
            result = stream.result
            return result.text if hasattr(result, 'text') else ""
        except Exception as e:
            print(f"Segment transcription failed: {e}")
            return ""

    def _merge_overlap_texts(self, texts: List[str], overlap_seconds: float) -> List[str]:
        """
        合并相邻段落的文本，去除重叠重复部分

        算法：
        - 比较相邻两段的文本
        - 找出重叠部分的公共后缀/前缀
        - 去除重复，保留一个
        """
        if len(texts) <= 1:
            return texts

        merged = [texts[0]]

        for i in range(1, len(texts)):
            current = texts[i]
            previous = merged[-1]

            # 找出previous的后缀和current的前缀的最大匹配
            common = self._find_common_overlap(previous, current)

            if common:
                # 有重叠，用current的有效部分替换
                merged[-1] = previous[:len(previous) - len(common)]
                merged.append(current)
            else:
                merged.append(current)

        # 过滤空文本
        merged = [t.strip() for t in merged if t.strip()]

        return merged

    def _find_common_overlap(self, text1: str, text2: str, max_overlap_chars: int = 50) -> str:
        """
        找出 text1 的后缀和 text2 的前缀的最大匹配

        Returns:
            匹配的字符串，如果没有匹配返回空字符串
        """
        # 限制检查范围
        text1_suffix = text1[-max_overlap_chars:] if len(text1) > max_overlap_chars else text1
        text2_prefix = text2[:max_overlap_chars] if len(text2) > max_overlap_chars else text2

        # 暴力匹配：尝试从最长开始匹配
        for length in range(min(len(text1_suffix), len(text2_prefix)), 0, -1):
            suffix = text1_suffix[-length:]
            prefix = text2_prefix[:length]

            if suffix == prefix:
                return suffix

        return ""

    def _format_segments(self, result) -> List[Dict]:
        """格式化分段信息（无时间戳版本）"""
        segments = []
        if hasattr(result, 'text') and result.text:
            segments.append({
                "id": 0,
                "start": 0.0,
                "end": 0.0,
                "text": result.text
            })
        return segments

    def _format_segments_with_time(self, result, start_time: float, end_time: float) -> List[Dict]:
        """格式化分段信息（带时间戳版本）"""
        segments = []
        text = result.text if hasattr(result, 'text') else ""
        if text:
            segments.append({
                "id": 0,
                "start": round(start_time, 2),
                "end": round(end_time, 2),
                "text": text
            })
        return segments

    def get_status(self) -> Dict[str, Any]:
        """获取服务状态"""
        return {
            "service_category": self.service_category.value,
            "model_type": self.model_type.value,
            "model_loaded": self.offline_recognizer is not None or self.online_recognizer is not None,
            "model_id": self.current_model_id,
            "active_sessions": len(self.streaming_sessions)
        }

    def _init_vad(self):
        """初始化 VAD 配置"""
        if not sherpa_onnx:
            return

        vad_model_path = os.getenv("SHERPA_VAD_MODEL", self.DEFAULT_VAD_MODEL)
        if not os.path.exists(vad_model_path):
            print(f"Warning: VAD model not found at {vad_model_path}")
            return

        self.vad_config = sherpa_onnx.VadModelConfig()
        self.vad_config.silero_vad.model = vad_model_path
        self.vad_config.silero_vad.min_silence_duration = 0.5  # 500ms 静音认为结束
        self.vad_config.sample_rate = 16000

    def create_streaming_session(
        self,
        session_id: str,
        mode: StreamingMode = StreamingMode.AUTO,
        on_result: Optional[callable] = None
    ) -> StreamingSession:
        """
        创建流式识别会话

        Args:
            session_id: 会话 ID
            mode: 流式模式
            on_result: 结果回调函数

        Returns:
            StreamingSession 实例
        """
        session = StreamingSession(
            session_id=session_id,
            mode=mode,
            on_result_callback=on_result
        )

        # 根据模式和模型能力设置 session
        if mode == StreamingMode.ONLINE and self.online_recognizer:
            session.online_recognizer = self.online_recognizer
            session.online_stream = self.online_recognizer.create_stream()
        elif mode == StreamingMode.SEGMENT or (mode == StreamingMode.AUTO and not self.online_recognizer):
            # 使用 VAD + Offline ASR 模式
            if self.vad_config:
                session.vad = sherpa_onnx.VoiceActivityDetector(
                    self.vad_config,
                    buffer_size_in_seconds=30
                )

        return session

    async def process_streaming_session(
        self,
        session: StreamingSession,
        audio_chunk: np.ndarray
    ) -> List[Dict[str, Any]]:
        """
        处理流式会话的音频块

        Args:
            session: 流式会话
            audio_chunk: 音频数据 (numpy array, float32)

        Returns:
            结果事件列表
        """
        results = []

        if session.mode == StreamingMode.ONLINE and session.online_recognizer:
            # Online 模式：直接送入 ASR
            session.online_stream.accept_waveform(16000, audio_chunk)
            while session.online_recognizer.is_ready(session.online_stream):
                session.online_recognizer.decode_stream(session.online_stream)

            result = session.online_recognizer.get_result(session.online_stream)
            if result.text:
                results.append({
                    "type": "partial",
                    "text": result.text
                })

                # 检测说完
                if session.online_recognizer.is_endpoint(session.online_stream):
                    results.append({
                        "type": "final",
                        "text": result.text
                    })
                    session.online_recognizer.reset(session.online_stream)

        elif session.mode == StreamingMode.SEGMENT and session.vad:
            # Segment 模式：VAD 检测 + Offline ASR
            session.vad.accept_waveform(audio_chunk)

            # 检查当前是否检测到语音
            is_speech = session.vad.is_speech_detected()

            # 状态变化检测
            if is_speech and session.vad_state == VadState.SILENCE:
                # 开始说话
                results.append({"type": "vad_start"})
                session.start_speaking()
                # 开始记录，清空旧缓冲区
                session.clear_buffer()

            elif not is_speech and session.vad_state == VadState.SPEAKING:
                # 结束说话（is_speech 从 True 变 False）
                results.append({"type": "vad_end"})
                session.end_speaking()

                # 处理缓冲区中的音频
                buffered_audio = session.get_buffered_audio()
                if buffered_audio is not None and len(buffered_audio) > 0:
                    final_text = await self._transcribe_offline_segment(buffered_audio)
                    if final_text:
                        results.append({
                            "type": "final",
                            "text": final_text
                        })
                session.clear_buffer()

            # 如果正在说话，添加增量样本到缓冲区
            if is_speech:
                # current_segment 是累积的，我们需要记录上次的位置来计算增量
                current_segment = session.vad.current_segment
                if current_segment is not None:
                    new_samples = current_segment.samples
                    # 只添加最新的增量（假设每次增加约 chunk_size 大小的样本）
                    # 由于 current_segment 累积特性，我们简单记录当前总量，
                    # 在结束时会自动清空重新开始
                    if not hasattr(session, '_last_segment_size'):
                        session._last_segment_size = 0

                    if len(new_samples) > session._last_segment_size:
                        # 只添加新增的部分
                        new_portion = new_samples[session._last_segment_size:]
                        if len(new_portion) > 0:
                            session.add_audio(np.array(new_portion, dtype=np.float32))
                        session._last_segment_size = len(new_samples)

            # 当说完一句话时，VAD 会通过 front/pop 返回一个 segment
            while not session.vad.empty():
                _ = session.vad.front
                session.vad.pop()
                # 这个 segment 的 samples 通常为 0，主要用于触发状态变化

        return results

    async def _transcribe_offline_segment(self, audio: np.ndarray) -> str:
        """对音频段落执行离线识别"""
        if not self.offline_recognizer:
            return ""

        stream = self.offline_recognizer.create_stream()
        stream.accept_waveform(16000, audio.astype(np.float32))
        self.offline_recognizer.decode_stream(stream)
        result = stream.result
        return result.text if hasattr(result, 'text') else ""

    def is_online_mode_supported(self) -> bool:
        """检查是否支持在线流式模式"""
        return self.online_recognizer is not None

    def create_vad_detector(self):
        """
        创建 VAD 检测器实例

        Returns:
            VoiceActivityDetector 实例或 None
        """
        if not self.vad_config:
            return None

        try:
            return sherpa_onnx.VoiceActivityDetector(
                self.vad_config,
                buffer_size_in_seconds=30
            )
        except Exception as e:
            print(f"Failed to create VAD detector: {e}")
            return None
