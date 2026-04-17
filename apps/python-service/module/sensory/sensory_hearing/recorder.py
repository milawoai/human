"""
Audio Recorder Management
基于 sounddevice 的硬件录音管理与 ASR 联动
"""
import asyncio
import numpy as np
import queue
import sys
from typing import Callable, Optional

try:
    import sounddevice as sd
except ImportError:
    print("Warning: sounddevice not installed. Please install it with 'pip install sounddevice'")
    sd = None

from .impl.sherpa_onnx_service import SherpaOnnxService


class AudioRecorderManager:
    """音频录制与实时 ASR 联动管理器 (单例)"""
    
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(AudioRecorderManager, cls).__new__(cls)
        return cls._instance

    def __init__(self, asr_service: Optional[SherpaOnnxService] = None):
        if hasattr(self, '_initialized') and self._initialized:
            return
            
        self.asr_service = asr_service
        self.is_recording = False
        self.audio_queue = queue.Queue()
        self.sample_rate = 16000
        self.block_size = 3200  # 200ms at 16k
        self.stream = None
        self.on_result_callback: Optional[Callable[[dict], None]] = None
        self.current_session_id: Optional[str] = None
        self._initialized = True

    def start(self, model_id: str, session_id: str, callback: Callable[[dict], None]):
        """开始录音并实时识别"""
        if self.is_recording:
            raise RuntimeError("Recording is already in progress")

        if not sd:
            raise RuntimeError("sounddevice is not installed")

        self.current_session_id = session_id
        self.on_result_callback = callback
        
        # 确保模型已加载
        # 注意：这里假设 asr_service 已经在外部初始化
        
        self.is_recording = True
        self.audio_queue = queue.Queue()
        
        def audio_callback(indata, frames, time, status):
            if status:
                print(f"Audio status: {status}", file=sys.stderr)
            self.audio_queue.put(indata.copy())

        self.stream = sd.InputStream(
            channels=1,
            samplerate=self.sample_rate,
            blocksize=self.block_size,
            callback=audio_callback,
            dtype=np.float32
        )
        self.stream.start()
        
        # 启动处理循环
        asyncio.create_task(self._processing_loop())
        print(f"Started recording with session {session_id} using model {model_id}")

    async def _processing_loop(self):
        """异步处理音频队列并推送 ASR 结果"""
        last_text = ""
        
        while self.is_recording:
            try:
                # 非阻塞获取音频块
                if self.audio_queue.empty():
                    await asyncio.sleep(0.01)
                    continue
                
                audio_chunk = self.audio_queue.get()
                
                # 扁平化并识别
                audio_data = audio_chunk.flatten()
                
                if self.asr_service:
                    # 获取中间结果
                    current_text = self.asr_service.process_streaming_chunk(
                        self.current_session_id, 
                        audio_data
                    )
                    
                    if current_text and current_text != last_text:
                        last_text = current_text
                        if self.on_result_callback:
                            self.on_result_callback({
                                "type": "partial",
                                "text": current_text,
                                "session_id": self.current_session_id
                            })
                            
                    # 检查端点 (句尾检测)
                    # sherpa-onnx 会在识别出完整句子后重置 stream 状态
                    # 这里可以根据 stream.is_endpoint 实现发送 sentence 类型
                    stream = self.asr_service.get_or_create_online_stream(self.current_session_id)
                    if self.asr_service.online_recognizer.is_endpoint(stream):
                        if self.on_result_callback and last_text:
                            self.on_result_callback({
                                "type": "sentence",
                                "text": last_text,
                                "session_id": self.current_session_id
                            })
                        self.asr_service.online_recognizer.reset(stream)
                        last_text = ""
                        
            except Exception as e:
                print(f"Error in processing loop: {e}")
                break

    def stop(self):
        """停止录音"""
        self.is_recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None
        
        print(f"Stopped recording for session {self.current_session_id}")
        self.current_session_id = None
        self.on_result_callback = None
