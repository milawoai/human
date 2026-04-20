"""
公共模块 — 跨模块共享的常量和工具
"""
from .neural_topics import (
    NS,
    TOPICS,
    SUB,
    ACTORS,
    CAPABILITIES,
    SUBSCRIBE_TOPICS,
    SUBSCRIBE_KINDS,
    EVENT_TOPIC_MAP,
    is_topic_in_namespace,
    is_caption_stream_topic,
)

__all__ = [
    "NS",
    "TOPICS",
    "SUB",
    "ACTORS",
    "CAPABILITIES",
    "SUBSCRIBE_TOPICS",
    "SUBSCRIBE_KINDS",
    "EVENT_TOPIC_MAP",
    "is_topic_in_namespace",
    "is_caption_stream_topic",
]
