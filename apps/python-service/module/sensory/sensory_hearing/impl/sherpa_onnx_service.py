"""
Sherpa-ONNX ASR Service Implementation
基于 Sherpa-ONNX 的语音识别实现
"""
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


class SherpaOnnxService(BaseASRService):
    """
    基于 Sherpa-ONNX 的通用 ASR 服务实现

    支持 Whisper、SenseVoice、Paraformer、Zipformer 等多种模型架构。
    对于 FunASR 系列模型，建议使用专门的 SherpaOnnxFunasrService。
    """

    def __init__(self, config: Optional[ASRModelConfig] = None):
        super().__init__(config)
        self.app_config = get_config()
        self.online_recognizer: Optional[sherpa_onnx.OnlineRecognizer] = None
        self.offline_recognizer: Optional[sherpa_onnx.OfflineRecognizer] = None
        self.current_model_id: Optional[str] = None

    @property
    def model_type(self) -> ASRModelType:
        return ASRModelType.FUNASR  # 暂时借用该枚举，后续可扩展

    @property
    def service_category(self) -> ASRServiceCategory:
        """服务分类标识 - 通用 sherpa-onnx 服务"""
        return ASRServiceCategory.SHERPA_ONNX_PARAFORMER  # 默认分类

    @property
    def default_model_name(self) -> str:
        """获取默认模型名称"""
        return "sherpa-onnx"

    async def load_model(self, model_id: str) -> bool:
        """加载指定的 Sherpa-ONNX 模型"""
        if not sherpa_onnx:
            return False

        if model_id == self.current_model_id and (self.online_recognizer or self.offline_recognizer):
            return True

        model_info = self.app_config.model_registry.get(model_id)
        if not model_info:
            print(f"Model ID {model_id} not found in registry.")
            return False

        model_path = Path(model_info.model_path)

        try:
            if model_info.can_streaming:
                self._load_online_model(model_path)
            else:
                self._load_offline_model(model_path)

            self.current_model_id = model_id
            model_type = "streaming" if model_info.can_streaming else "non-streaming"
            print(f"Successfully loaded Sherpa-ONNX model: {model_id} ({model_type})")
            return True
        except Exception as e:
            print(f"Failed to load model {model_id}: {e}")
            return False

    def _load_online_model(self, model_dir: Path):
        """加载流式模型 (Online)"""
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
        """加载离线模型 (Offline)"""
        # 首先检查是否是 FunASR-Nano 模型 (带 LLM)
        encoder_adaptor = model_dir / "encoder_adaptor.onnx"
        llm_model = model_dir / "llm.onnx"
        llm_fp32 = model_dir / "llm.fp32.onnx"
        embedding = model_dir / "embedding.onnx"
        tokenizer_dir = model_dir / "Qwen3-0.6B"

        if encoder_adaptor.exists() and (llm_model.exists() or llm_fp32.exists()) and embedding.exists():
            # FunASR-Nano 模型：使用专门的工厂方法
            llm_path = str(llm_model) if llm_model.exists() else str(llm_fp32)
            self.offline_recognizer = sherpa_onnx.OfflineRecognizer.from_funasr_nano(
                encoder_adaptor=str(encoder_adaptor),
                llm=llm_path,
                embedding=str(embedding),
                tokenizer=str(tokenizer_dir),
                num_threads=4,
                provider="cpu",
                debug=False,
            )
            self.online_recognizer = None
            return

        # 其他离线模型 (Whisper / SenseVoice / Paraformer)
        tokens = next(model_dir.glob("**/tokens.txt"))

        # 尝试识别是否为 Whisper
        whisper_models = list(model_dir.glob("**/whisper*.onnx"))

        if whisper_models:
            # Whisper 配置
            encoder = next(model_dir.glob("**/*encoder*.onnx"))
            decoder = next(model_dir.glob("**/*decoder*.onnx"))
            model_config = sherpa_onnx.OfflineModelConfig(
                whisper=sherpa_onnx.OfflineWhisperModelConfig(
                    encoder=str(encoder),
                    decoder=str(decoder),
                ),
                tokens=str(tokens),
                num_threads=4,
                debug=False,
            )
        else:
            # 默认假设是通用 SenseVoice/Paraformer
            model_file = next(model_dir.glob("**/*.onnx"))
            model_config = sherpa_onnx.OfflineModelConfig(
                sense_voice=sherpa_onnx.OfflineSenseVoiceModelConfig(
                    model=str(model_file),
                ),
                tokens=str(tokens),
                num_threads=4,
                debug=False,
            )

        config = sherpa_onnx.OfflineRecognizerConfig(
            model_config=model_config,
            decoding_method="greedy_search",
        )

        self.offline_recognizer = sherpa_onnx.OfflineRecognizer(config)
        self.online_recognizer = None

    def process_streaming_chunk(self, session_id: str, audio_chunk: np.ndarray) -> str:
        """处理流式音频块，返回中间结果"""
        if not self.online_recognizer:
            return ""

        stream = self.get_or_create_online_stream(session_id)
        stream.accept_waveform(16000, audio_chunk)

        while self.online_recognizer.is_ready(stream):
            self.online_recognizer.decode_stream(stream)

        return self.online_recognizer.get_result(stream).text

    async def transcribe_chunk(
        self,
        audio_data: bytes,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        转录音频块 - 流式识别（同步实现）
        """
        import numpy as np
        audio_array = np.frombuffer(audio_data, dtype=np.float32)
        session_id = config.get("session_id", "default")
        text = self.process_streaming_chunk(session_id, audio_array)
        return {
            "success": True,
            "text": text,
            "is_final": False
        }

    async def finalize_session(
        self,
        session_id: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        结束会话，处理剩余缓冲区数据
        """
        if self.online_recognizer:
            stream = self.get_or_create_online_stream(session_id)
            self.online_recognizer.decode_stream(stream)
            result = self.online_recognizer.get_result(stream)
            self.online_recognizer.reset(stream)
            return {
                "success": True,
                "text": result.text,
                "is_final": True
            }
        return {"success": False, "error": "No active recognizer"}

    def get_or_create_online_stream(self, session_id: str):
        """管理会话对应的 OnlineStream"""
        session = self.get_or_create_session(session_id)
        if not hasattr(session, 'sherpa_stream'):
            session.sherpa_stream = self.online_recognizer.create_stream()
        return session.sherpa_stream

    async def transcribe_file(self, file_path: str) -> Dict:
        """转录完整音频文件"""
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

        stream = self.offline_recognizer.create_stream()
        stream.accept_waveform(16000, audio.astype(np.float32))

        self.offline_recognizer.decode_stream(stream)
        result = stream.result  # 正确的方式：直接从 stream 获取结果

        return {
            "success": True,
            "text": result.text,
            "segments": self._format_segments(result)
        }

    def _format_segments(self, result) -> List[Dict]:
        """模拟分段信息 (如果模型支持时间戳)"""
        # 注意：部分 sherpa-onnx 离线结果包含 timestamps
        segments = []
        if hasattr(result, 'timestamps') and result.timestamps:
            # 简单的模拟分段：按句号分割或固定长度
            # 这里可以根据具体的 timestamps 实现更精细的分段
            segments.append({
                "id": 0,
                "start": 0.0,
                "end": 0.0, # 待填充
                "text": result.text
            })
        return segments
