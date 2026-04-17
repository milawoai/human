from fastapi.routing import APIRoute


def test_sensory_hearing_controller_exposes_asr_router():
    from module.sensory.sensory_hearing.controllers import SpeechRecognitionController

    controller = SpeechRecognitionController(debug=False)
    router = controller.get_router()

    paths = {route.path for route in router.routes if isinstance(route, APIRoute)}
    assert "/asr/models" in paths
    assert "/asr/status" in paths
    assert "/asr/transcribe" in paths


def test_main_app_mounts_sensory_hearing_routes():
    from main import app

    paths = {route.path for route in app.routes if isinstance(route, APIRoute)}
    assert "/api/v1/asr/models" in paths
    assert "/api/v1/asr/status" in paths


def test_asr_model_registry_uses_audio_model_root_env(monkeypatch):
    from module.sensory.sensory_hearing.config import ASRServiceConfig

    monkeypatch.setenv("AUDIO_MODEL_ROOT", "/tmp/human-audio-models")

    config = ASRServiceConfig.from_env()

    assert (
        config.model_registry["funasr-nano"].model_path
        == "/tmp/human-audio-models/funasr-nano"
    )
