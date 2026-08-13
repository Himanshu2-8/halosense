"""
Prosody Service — Speech rate, pause analysis, energy, pitch.

Input: waveform, sample rate, word timings from ASR, emotion scores
Output: ProsodyFeatures dict (see CONTRACT.md §4.1)

These features power our fatigue detection — our key differentiator.

Lane: A
"""

import numpy as np


def compute_prosody(
    waveform: np.ndarray,
    sr: int,
    words: list[dict],
    emotion_output: dict,
) -> dict:
    """
    Compute prosody features from audio and ASR output.

    Args:
        waveform: 1D float32 numpy array
        sr: Sample rate (typically 16000)
        words: List of {"word": str, "start": float, "end": float}
        emotion_output: {"arousal": float, "dominance": float, "valence": float}

    Returns:
        ProsodyFeatures dict matching CONTRACT.md §4.1
    """
    duration_s = len(waveform) / sr if sr > 0 else 0
    word_count = len(words)

    # ── Speech rate ──────────────────────────────────────────────
    if word_count > 0:
        voiced_duration = sum(max(0, w["end"] - w["start"]) for w in words)
        speech_rate_wps = word_count / voiced_duration if voiced_duration > 0.01 else None
    else:
        voiced_duration = 0
        speech_rate_wps = None

    # ── Pause ratio ──────────────────────────────────────────────
    if duration_s > 0 and word_count > 0:
        pause_ratio = max(0.0, min(1.0, 1.0 - (voiced_duration / duration_s)))
    else:
        pause_ratio = None

    # ── Pause statistics ─────────────────────────────────────────
    mean_pause_s = None
    longest_pause_s = None
    if word_count >= 2:
        gaps = []
        for i in range(len(words) - 1):
            gap = words[i + 1]["start"] - words[i]["end"]
            if gap > 0.01:  # Only count real gaps (>10ms)
                gaps.append(gap)
        if gaps:
            mean_pause_s = float(np.mean(gaps))
            longest_pause_s = float(max(gaps))

    # ── RMS energy (loudness proxy) ──────────────────────────────
    rms = float(np.sqrt(np.mean(waveform.astype(np.float64) ** 2)))
    rms_energy = min(1.0, rms / 0.1)  # 0.1 ≈ "very loud" for compressed radio

    # ── Pitch (median F0) — optional ─────────────────────────────
    pitch_hz = None
    try:
        import librosa

        f0, voiced_flag, _ = librosa.pyin(
            waveform.astype(np.float64),
            fmin=50,
            fmax=500,
            sr=sr,
        )
        if voiced_flag is not None:
            voiced_f0 = f0[voiced_flag]
        else:
            voiced_f0 = f0[~np.isnan(f0)]
        if len(voiced_f0) > 0:
            pitch_hz = round(float(np.nanmedian(voiced_f0)), 1)
    except (ImportError, Exception):
        pitch_hz = None

    return {
        "arousal": emotion_output["arousal"],
        "dominance": emotion_output["dominance"],
        "valence": emotion_output["valence"],
        "speech_rate_wps": round(speech_rate_wps, 2) if speech_rate_wps is not None else None,
        "pause_ratio": round(pause_ratio, 3) if pause_ratio is not None else None,
        "mean_pause_s": round(mean_pause_s, 3) if mean_pause_s is not None else None,
        "longest_pause_s": round(longest_pause_s, 3) if longest_pause_s is not None else None,
        "rms_energy": round(rms_energy, 3),
        "pitch_hz": pitch_hz,
        "duration_s": round(duration_s, 2),
        "word_count": word_count,
    }
