"""
ASR Service — Whisper transcription with word-level timestamps.

Model: openai/whisper-small
Input: Path to audio file
Output: {"transcript": str, "words": [...], "asr_model": str}

Lane: A
"""

import logging

logger = logging.getLogger(__name__)

# Lazy-loaded singleton
_pipe = None


def _get_pipeline(device: str):
    """Load the Whisper pipeline once and cache it."""
    global _pipe
    if _pipe is not None:
        return _pipe

    import torch
    from transformers import pipeline as hf_pipeline

    # Resolve device for pipeline
    if device == "cuda" and torch.cuda.is_available():
        device_arg = 0  # GPU index
    elif device == "mps":
        device_arg = "mps"
    else:
        device_arg = -1  # CPU

    logger.info("Loading Whisper model (openai/whisper-small)...")
    _pipe = hf_pipeline(
        "automatic-speech-recognition",
        model="openai/whisper-small",
        device=device_arg,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
    )
    logger.info("Whisper model loaded.")
    return _pipe


def transcribe(wav_path: str, device: str = "auto") -> dict:
    """
    Transcribe an audio file and return word-level timestamps.

    Args:
        wav_path: Path to audio file (wav, mp3, etc.)
        device: "auto" | "cuda" | "mps" | "cpu"

    Returns:
        {
            "transcript": str,
            "words": [{"word": str, "start": float, "end": float}, ...],
            "asr_model": "openai/whisper-small"
        }
    """
    if device == "auto":
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"

    pipe = _get_pipeline(device)

    import soundfile as sf
    import librosa

    # Load audio explicitly to avoid ffmpeg dependency
    waveform, sr = sf.read(wav_path)
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    if sr != 16000:
        waveform = librosa.resample(waveform, orig_sr=sr, target_sr=16000)
        sr = 16000

    # Run inference with word timestamps
    result = pipe(
        {"array": waveform, "sampling_rate": sr},
        return_timestamps="word",
        generate_kwargs={"language": "en", "task": "transcribe"},
    )

    # Extract transcript
    transcript = result.get("text", "").strip()

    # Extract word timings
    words = []
    for chunk in result.get("chunks", []):
        ts = chunk.get("timestamp")
        word_text = chunk.get("text", "").strip()
        if ts and word_text and ts[0] is not None and ts[1] is not None:
            words.append(
                {
                    "word": word_text,
                    "start": round(float(ts[0]), 3),
                    "end": round(float(ts[1]), 3),
                }
            )

    return {
        "transcript": transcript,
        "words": words,
        "asr_model": "openai/whisper-small",
    }
