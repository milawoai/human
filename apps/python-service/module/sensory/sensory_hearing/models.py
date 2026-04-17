"""
Speech Recognition Models
语音识别数据模型
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class TranscriptionConfig(BaseModel):
    """转录配置"""
    mode: str = Field(default="2pass", description="识别模式: offline/online/2pass")
    wav_name: str = Field(default="audio", description="音频文件名")
    wav_format: str = Field(default="pcm", description="音频格式: pcm/wav/mp3等")
    audio_fs: int = Field(default=16000, description="音频采样率")
    chunk_size: List[int] = Field(default=[5, 10, 5], description="分块大小配置")
    hotwords: Optional[str] = Field(default=None, description="热词JSON字符串")
    itn: bool = Field(default=True, description="是否启用逆文本归一化")
    # 新增: 模型类型参数
    model_type: str = Field(default="funasr", description="模型类型: funasr/qwen3")
    model_path: Optional[str] = Field(default=None, description="模型路径 (可选)")
    aligner_path: Optional[str] = Field(default=None, description="对齐器路径 (Qwen3专用)")
    language: Optional[str] = Field(default=None, description="语言 (Qwen3专用, 自动检测)")


class TranscriptionResult(BaseModel):
    """转录结果"""
    mode: str = Field(..., description="结果模式: 2pass-online/2pass-offline/offline/online")
    wav_name: str = Field(..., description="音频文件名")
    text: str = Field(..., description="识别的文本")
    is_final: bool = Field(default=False, description="是否为最终结果")
    timestamp: Optional[List[List[int]]] = Field(default=None, description="时间戳信息")
    # 新增: 语言信息 (Qwen3 返回)
    language: Optional[str] = Field(default=None, description="检测到的语言")


class RecognitionStatus(BaseModel):
    """识别状态"""
    connected: bool = Field(default=False, description="是否已连接")
    recognizing: bool = Field(default=False, description="是否正在识别")
    model_loaded: bool = Field(default=False, description="模型是否已加载")
    model_name: str = Field(default="", description="当前使用的模型")
    # 新增: 模型类型
    model_type: str = Field(default="funasr", description="当前模型类型")
    active_sessions: int = Field(default=0, description="活动会话数")
