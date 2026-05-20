import asyncio

from module.common.neural_topics import TOPICS
from module.sensory.sensory_hearing.neural_adapter import NeuralAdapter


class _FakeNeuralClient:
    def __init__(self):
        self.sent = []

    async def send_event(self, topic: str, payload: dict):
        self.sent.append((topic, payload))


def test_segment_ready_does_not_emit_question_finalized_event():
    client = _FakeNeuralClient()
    adapter = NeuralAdapter(client, asr_service=None)

    asyncio.run(
        adapter.emit_event(
            "segment_ready",
            {
                "session_id": "sess-1",
                "segment_id": "seg-1",
                "text": "你好，今天会议几点开始",
            },
        )
    )

    topics = [topic for topic, _ in client.sent]
    assert TOPICS["SENSORY_HEARING_SEGMENT"] in topics
    assert TOPICS["SENSORY_HEARING_QUESTION_FINALIZED"] not in topics


def test_segment_ready_with_empty_text_does_not_emit_question_finalized():
    client = _FakeNeuralClient()
    adapter = NeuralAdapter(client, asr_service=None)

    asyncio.run(
        adapter.emit_event(
            "segment_ready",
            {
                "session_id": "sess-1",
                "segment_id": "seg-1",
                "text": "   ",
            },
        )
    )

    topics = [topic for topic, _ in client.sent]
    assert TOPICS["SENSORY_HEARING_SEGMENT"] in topics
    assert TOPICS["SENSORY_HEARING_QUESTION_FINALIZED"] not in topics
