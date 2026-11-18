import asyncio
from module.sensory.sensory_hearing.controllers import SpeechRecognitionController


def test_shutdown_closes_recording_before_neural_and_cancels_audio_tasks():
    async def scenario():
        events = []
        class Adapter:
            async def close(self): events.append('audio-close')
        class Client:
            async def disconnect(self): events.append('neural-disconnect')
        controller = SpeechRecognitionController()
        controller.neural_adapter = Adapter()
        controller.neural_client = Client()
        task = asyncio.create_task(asyncio.sleep(100))
        controller.audio_tasks['fixture'] = task
        controller.streaming_sessions['fixture'] = object()
        await controller.stop_neural()
        assert events == ['audio-close', 'neural-disconnect']
        assert task.cancelled()
        assert not controller.audio_tasks and not controller.streaming_sessions
        await controller.stop_neural()
        assert len(events) == 2
    asyncio.run(scenario())
