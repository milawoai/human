from module.sensory.sensory_hearing.vad_recording_session import normalize_asr_text


def test_normalize_asr_text_filters_silence_tokens():
    assert normalize_asr_text("/sil") == ""
    assert normalize_asr_text(" /sil ") == ""
    assert normalize_asr_text("<sil>") == ""
    assert normalize_asr_text("[sil]") == ""


def test_normalize_asr_text_preserves_real_text():
    assert normalize_asr_text("你好") == "你好"
    assert normalize_asr_text("  hello world  ") == "hello world"
