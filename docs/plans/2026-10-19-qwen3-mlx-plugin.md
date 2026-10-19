# Qwen3-MLX TTS Plugin Implementation Plan

**Goal:** Install Human's first real external TTS plugin without adding engine-specific code to Motor.

**Architecture:** Source lives at `/Users/zhou/Desktop/human-tools/tts/qwen3-mlx`. A dependency-free CommonJS provider implements `tts@1.0` and owns a Python worker over private stdin/stdout JSON lines (no additional listening port). The worker serializes MLX inference, retains loaded models and reference waveforms, and atomically writes WAV/MP3 under the host TTS cache. Human serves the returned audioUrl; Brain/Body orchestration is outside this change.

**Tech Stack:** Node built-ins and node:test; Python 3.12 stdlib JSON lines/unittest, existing mlx-audio 0.5.9, numpy, FFmpeg.

## Implementation sequence

Define failing Python tests for validation, clone discovery, model reuse, output and cache boundaries; define Node tests that exercise the provider against a lightweight worker fixture. Implement the inference worker, provider and versioned manifest. Verify tests before installing files outside the workspace. Preserve existing reference recordings and README instructions.

Install the local package into `~/.ai_secretary/plugins`, register only its manifest/index entry, and use the running backend if available. Otherwise start an isolated temporary backend for verification. Check category discovery, preset synthesis, clone synthesis, MP3, invalid arguments and actual HTTP audio bytes. Retain a reproducible README and installation script; keep credentials and recordings outside package artifacts.

## Scope and operational choices

Default engine is Qwen3-TTS CustomVoice 0.6B 8bit with Serena. Clone IDs use `clone:<directory>` and require reference.wav plus reference.txt. The plugin starts its own worker lazily; model loading occurs only on synthesis. Reload/unregister stops only its owned worker. Requests have timeouts and cancellation; inference is serialized. A cancelled or timed-out request terminates the owned worker and rejects queued calls rather than continuing unbounded GPU work.

Model/reference caches are in-process, not durable serialized MLX features. Audio cache uses unique file names and bounded retention. First model use may download weights. Installation does not modify backend dependencies. Real Body playback and automatic answer narration remain separate work.
