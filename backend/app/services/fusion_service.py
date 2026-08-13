import time

import numpy as np
import soundfile as sf

from app.services.asr_service import transcribe
from app.services.emotion_service import analyze_emotion
from app.services.prosody_service import compute_prosody


def _resolve_device(device: str) -> str:
    if device != "auto":
        return device
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _compute_mood(prosody: dict) -> dict:
    """Rule-based mood fusion. See AGENTS.md §8 for the full explanation."""
    arousal = prosody["arousal"]
    valence = prosody["valence"]
    speech_rate = prosody.get("speech_rate_wps")
    pause_ratio = prosody.get("pause_ratio")
    mean_pause = prosody.get("mean_pause_s")
    rms_energy = prosody.get("rms_energy")
    word_count = prosody["word_count"]
    duration_s = prosody["duration_s"]

    # --- Stress index ---
    stress_index = arousal * (1.0 - valence)
    stress_index = max(0.0, min(1.0, stress_index))

    # --- Fatigue index ---
    fatigue_signals = []
    if arousal < 0.4:
        fatigue_signals.append(0.3)
    if speech_rate is not None and speech_rate < 2.5:
        fatigue_signals.append(0.3)
    if pause_ratio is not None and pause_ratio > 0.4:
        fatigue_signals.append(0.2)
    if mean_pause is not None and mean_pause > 0.5:
        fatigue_signals.append(0.2)
    fatigue_index = min(1.0, sum(fatigue_signals))

    # --- Label decision ---
    STRESS_THRESHOLD = 0.55
    FATIGUE_THRESHOLD = 0.50

    if word_count < 2 or duration_s < 0.5:
        label = "UNKNOWN"
        confidence = 0.0
    elif stress_index >= STRESS_THRESHOLD:
        label = "STRESSED"
        confidence = min(1.0, stress_index)
    elif fatigue_index >= FATIGUE_THRESHOLD:
        label = "TIRED"
        confidence = min(1.0, fatigue_index)
    else:
        label = "CALM"
        confidence = 1.0 - max(stress_index, fatigue_index)

    # --- Quadrant ---
    if arousal >= 0.5 and valence < 0.5:
        quadrant = "HIGH_AROUSAL_NEGATIVE"
    elif arousal >= 0.5 and valence >= 0.5:
        quadrant = "HIGH_AROUSAL_POSITIVE"
    elif arousal < 0.5 and valence < 0.5:
        quadrant = "LOW_AROUSAL_NEGATIVE"
    else:
        quadrant = "LOW_AROUSAL_POSITIVE"

    # --- Contributing factors ---
    factors = []
    if arousal > 0.65:
        factors.append("high_arousal")
    if arousal < 0.35:
        factors.append("low_arousal")
    if valence < 0.35:
        factors.append("negative_valence")
    if valence > 0.65:
        factors.append("positive_valence")
    if speech_rate and speech_rate > 3.5:
        factors.append("fast_speech")
    if speech_rate and speech_rate < 2.0:
        factors.append("slow_speech")
    if pause_ratio and pause_ratio > 0.4:
        factors.append("long_pauses")
    if rms_energy and rms_energy > 0.7:
        factors.append("high_volume")

    # --- Rationale ---
    arousal_desc = "High" if arousal > 0.5 else "Low"
    valence_desc = "negative" if valence < 0.5 else "positive"
    rationale = (
        f"{arousal_desc} arousal ({arousal:.2f}) with {valence_desc} valence ({valence:.2f})"
    )
    if label == "STRESSED":
        rationale += " indicates acute stress."
    elif label == "TIRED":
        rate_str = f" Speech rate {speech_rate:.1f} w/s" if speech_rate else ""
        rationale += f".{rate_str} suggests fatigue."
    elif label == "UNKNOWN":
        rationale = "Insufficient audio data for reliable classification."
    else:
        rationale += " indicates a calm state."

    return {
        "label": label,
        "confidence": round(confidence, 3),
        "stress_index": round(stress_index, 3),
        "fatigue_index": round(fatigue_index, 3),
        "quadrant": quadrant,
        "rationale": rationale,
        "contributing_factors": factors,
    }


def analyze_audio(wav_path: str, device: str = "auto") -> dict:
    start = time.time()
    resolved_device = _resolve_device(device)

    # 1. Load audio
    waveform, sr = sf.read(wav_path)
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    waveform = waveform.astype(np.float32)

    # Resample to 16kHz if needed
    if sr != 16000:
        import librosa

        waveform = librosa.resample(waveform, orig_sr=sr, target_sr=16000)
        sr = 16000

    # 2. ASR
    asr_result = transcribe(wav_path, device=resolved_device)

    # 3. Emotion
    emotion_result = analyze_emotion(waveform, sr=sr, device=resolved_device)

    # 4. Prosody features
    prosody = compute_prosody(waveform, sr, asr_result["words"], emotion_result)

    # 5. Mood fusion
    mood = _compute_mood(prosody)

    processing_ms = int((time.time() - start) * 1000)

    return {
        "transcript": asr_result["transcript"],
        "words": asr_result["words"],
        "asr_model": asr_result["asr_model"],
        "prosody": prosody,
        "mood": mood,
        "processing_ms": processing_ms,
        "mocked": False,
    }
