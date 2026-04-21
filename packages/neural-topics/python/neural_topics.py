"""
Neural Topics — Python 常量导出

与 topics.json 手动保持同步。
所有 Neural Core topic 字符串的唯一 Python 来源。
"""

# ──────────────────────────────────────────────
# Namespaces
# ──────────────────────────────────────────────

NS = {
    "SENSORY_HEARING": "sensory.hearing.caption_stream",
    "BRAIN_INIT": "brain.init",
}

# ──────────────────────────────────────────────
# Topics
# ──────────────────────────────────────────────

TOPICS = {
    # control
    "SENSORY_HEARING_ENABLE": "sensory.hearing.caption_stream.enable",
    "SENSORY_HEARING_DISABLE": "sensory.hearing.caption_stream.disable",
    # query
    "SENSORY_HEARING_ASR_MODELS": "sensory.hearing.caption_stream.asr_models",
    # event
    "SENSORY_HEARING_PREPARED": "sensory.hearing.caption_stream.prepared",
    "SENSORY_HEARING_STARTED": "sensory.hearing.caption_stream.started",
    "SENSORY_HEARING_VAD_START": "sensory.hearing.caption_stream.vad_start",
    "SENSORY_HEARING_VAD_END": "sensory.hearing.caption_stream.vad_end",
    "SENSORY_HEARING_SEGMENT": "sensory.hearing.caption_stream.segment",
    "SENSORY_HEARING_STOPPED": "sensory.hearing.caption_stream.stopped",
    "SENSORY_HEARING_ERROR": "sensory.hearing.caption_stream.error",
    # brain.init — command & event
    "BRAIN_INIT_EXECUTE": "brain.init.execute",
    "BRAIN_INIT_DONE": "brain.init.init_done",
    "BRAIN_INIT_ERROR": "brain.init.init_error",
}

# ──────────────────────────────────────────────
# Subscribe patterns
# ──────────────────────────────────────────────

SUB = {
    "SENSORY_HEARING_ALL": "sensory.hearing.caption_stream.*",
}

# ──────────────────────────────────────────────
# Actor definitions
# ──────────────────────────────────────────────

ACTORS = {
    "SENSORY_HEARING": {
        "actorId": "sensory-hearing",
        "runtime": "python",
        "system": "sensory",
        "module": "hearing",
    },
    "BRAIN": {
        "actorId": "brain-main",
        "runtime": "nest",
        "system": "brain",
        "module": "init",
    },
}

# ──────────────────────────────────────────────
# Capabilities
# ──────────────────────────────────────────────

CAPABILITIES = [
    {
        "id": "sensory.hearing.caption_stream",
        "actor": ACTORS["SENSORY_HEARING"],
        "topic": TOPICS["SENSORY_HEARING_ENABLE"],
        "kinds": ["control"],
        "mode": "stream",
        "enabled": True,
        "online": True,
    },
    {
        "id": "sensory.hearing.caption_stream.stop",
        "actor": ACTORS["SENSORY_HEARING"],
        "topic": TOPICS["SENSORY_HEARING_DISABLE"],
        "kinds": ["control"],
        "mode": "once",
        "enabled": True,
        "online": True,
    },
    {
        "id": "sensory.hearing.caption_stream.asr_models",
        "actor": ACTORS["SENSORY_HEARING"],
        "topic": TOPICS["SENSORY_HEARING_ASR_MODELS"],
        "kinds": ["query"],
        "mode": "once",
        "enabled": True,
        "online": True,
    },
    {
        "id": "brain.init",
        "actor": ACTORS["BRAIN"],
        "topic": TOPICS["BRAIN_INIT_EXECUTE"],
        "kinds": ["command"],
        "mode": "once",
        "enabled": True,
        "online": True,
    },
]

# ──────────────────────────────────────────────
# Subscribe config
# ──────────────────────────────────────────────

SUBSCRIBE_TOPICS = [SUB["SENSORY_HEARING_ALL"]]
SUBSCRIBE_KINDS = ["control"]

# ──────────────────────────────────────────────
# Event type → topic 映射
# ──────────────────────────────────────────────

EVENT_TOPIC_MAP = {
    "prepared": TOPICS["SENSORY_HEARING_PREPARED"],
    "started": TOPICS["SENSORY_HEARING_STARTED"],
    "vad_start": TOPICS["SENSORY_HEARING_VAD_START"],
    "vad_end": TOPICS["SENSORY_HEARING_VAD_END"],
    "segment_ready": TOPICS["SENSORY_HEARING_SEGMENT"],
    "stopped": TOPICS["SENSORY_HEARING_STOPPED"],
    "error": TOPICS["SENSORY_HEARING_ERROR"],
}


# ──────────────────────────────────────────────
# 便捷方法
# ──────────────────────────────────────────────

def is_topic_in_namespace(topic: str, ns: str) -> bool:
    return topic.startswith(ns + ".")


def is_caption_stream_topic(topic: str) -> bool:
    return is_topic_in_namespace(topic, NS["SENSORY_HEARING"])
