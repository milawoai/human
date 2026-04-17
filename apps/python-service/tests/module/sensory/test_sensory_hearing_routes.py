from fastapi.routing import APIRoute
import tomllib


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


def test_sensory_hearing_exposes_only_sherpa_onnx_services():
    from module.sensory.sensory_hearing import ASRServiceConfig
    from module.sensory.sensory_hearing.impl import (
        SherpaOnnxFunasrService,
        SherpaOnnxService,
    )

    assert SherpaOnnxFunasrService is not None
    assert SherpaOnnxService is not None

    config = ASRServiceConfig()
    removed_fields = [
        "default_model_type",
        "funasr_model_name",
        "funasr_model_path",
        "qwen3_model_name",
        "qwen3_model_path",
        "qwen3_aligner_path",
        "device",
        "dtype",
        "gpu_memory_utilization",
    ]
    for field_name in removed_fields:
        assert not hasattr(config, field_name)


def test_python_service_does_not_depend_on_removed_asr_backends():
    with open("pyproject.toml", "rb") as pyproject_file:
        project = tomllib.load(pyproject_file)

    dependencies = set(project["project"]["dependencies"])

    assert "funasr>=1.0.0" not in dependencies
    assert "qwen-asr>=0.0.6" not in dependencies
    assert "torch==2.9.*" not in dependencies
    assert "torchaudio==2.9.*" not in dependencies
