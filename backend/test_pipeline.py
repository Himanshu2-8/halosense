# test_pipeline.py
import json
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, ".")

from app.services.fusion_service import analyze_audio

# Create a dummy audio file for testing
dummy_path = "dummy_test.wav"
sr = 16000
duration = 1.0
t = np.linspace(0, duration, int(sr * duration), False)
# Generate a simple 440 Hz sine wave
audio_data = np.sin(440 * 2 * np.pi * t)
sf.write(dummy_path, audio_data, sr)

try:
    print("Testing ML Pipeline on dummy audio...")
    result = analyze_audio(dummy_path, device="auto")

    print("\nResult:")
    print(json.dumps(result, indent=2))

    # Verify the output matches CONTRACT.md
    assert "transcript" in result
    assert "words" in result
    assert "prosody" in result
    assert "mood" in result
    assert result["mood"]["label"] in ("CALM", "STRESSED", "TIRED", "UNKNOWN")
    assert 0 <= result["mood"]["stress_index"] <= 1
    assert 0 <= result["mood"]["fatigue_index"] <= 1
    print("\n[PASS] Pipeline test passed!")
finally:
    if os.path.exists(dummy_path):
        os.remove(dummy_path)
