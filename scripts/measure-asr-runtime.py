"""Read-only disk/constructor spike with optional local model loading. No recording or downloads."""
import json
import argparse
import asyncio
import resource
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'apps/python-service'))
from dotenv import load_dotenv
load_dotenv(root / 'apps/python-service/.env')
started = time.monotonic()
from module.sensory.sensory_hearing.config import get_config
from module.sensory.sensory_hearing.impl.sherpa_onnx_funasr_service import SherpaOnnxFunasrService
service = SherpaOnnxFunasrService()
constructor_ms = round((time.monotonic() - started) * 1000, 2)
models = []
for key, definition in get_config().model_registry.items():
    directory = Path(definition.model_path)
    files = [file for file in directory.rglob('*') if file.is_file()] if directory.is_dir() else []
    models.append({'id': key, 'exists': directory.is_dir(), 'fileCount': len(files),
                   'bytes': sum(file.stat().st_size for file in files)})
parser = argparse.ArgumentParser()
parser.add_argument('--load-model', choices=list(get_config().model_registry))
args = parser.parse_args()
load_ms, loaded = None, False
if args.load_model:
    load_start = time.monotonic()
    loaded = asyncio.run(service.load_model(args.load_model))
    load_ms = round((time.monotonic() - load_start) * 1000, 2)
print(json.dumps({'constructorMs': constructor_ms, 'maxRssPlatformUnits': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                  'models': models, 'modelId': args.load_model, 'modelLoadMs': load_ms, 'modelLoaded': loaded, 'microphoneOpened': False, 'downloaded': False}, indent=2))
