"""
Cache Service — Read/write data/cache/analyses.json.

This is the central store of all precomputed clip analyses.
Lane B owns this. Lane A's precompute script writes to it.

Lane: B
"""

import json
import logging
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

_cache: Optional[dict] = None


def _audio_exists(clip_id: str) -> bool:
    """Return whether a cached clip has a corresponding playable file."""
    clips_dir = settings.resolve_path(settings.CLIPS_DIR)
    uploads_dir = settings.resolve_path(settings.UPLOADS_DIR)
    extensions = (".wav", ".mp3", ".m4a", ".ogg", ".flac")
    return any((directory / f"{clip_id}{ext}").is_file() for directory in (clips_dir, uploads_dir) for ext in extensions)


def load_cache() -> dict:
    """Load the analyses.json file into memory. Returns dict keyed by clip_id."""
    cache_path = settings.resolve_path(settings.CACHE_FILE)
    if not cache_path.exists():
        logger.warning(f"Cache file not found: {cache_path}. Starting empty.")
        return {}
    with open(cache_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # data is a list of ClipAnalysis dicts
    return {item["clip_id"]: item for item in data}


def get_cache() -> dict:
    """Singleton: load once, return cached dict."""
    global _cache
    if _cache is None:
        _cache = load_cache()
    return _cache


def get_available_cache() -> dict:
    """Return analyses that can be demonstrated with their matching audio."""
    return {clip_id: analysis for clip_id, analysis in get_cache().items() if _audio_exists(clip_id)}


def add_to_cache(clip_id: str, analysis: dict) -> None:
    """Add a new analysis (e.g., from a live upload) and persist to disk."""
    cache = get_cache()
    cache[clip_id] = analysis
    _save_cache(cache)


def _save_cache(cache: dict) -> None:
    """Write the cache back to analyses.json."""
    cache_path = settings.resolve_path(settings.CACHE_FILE)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    data = list(cache.values())
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    logger.info(f"Cache saved: {len(data)} clips.")


def get_mock_analysis(clip_id: str) -> dict:
    """Return deterministic mock data for any clip_id. Used when MOCK_ML=1."""
    return {
        "transcript": "Mock transcript for testing purposes.",
        "words": [
            {"word": "Mock", "start": 0.0, "end": 0.3},
            {"word": "transcript", "start": 0.4, "end": 0.8},
            {"word": "for", "start": 0.9, "end": 1.0},
            {"word": "testing", "start": 1.1, "end": 1.4},
            {"word": "purposes.", "start": 1.5, "end": 2.0},
        ],
        "asr_model": "openai/whisper-small",
        "prosody": {
            "arousal": 0.65,
            "dominance": 0.50,
            "valence": 0.40,
            "speech_rate_wps": 2.50,
            "pause_ratio": 0.20,
            "mean_pause_s": 0.15,
            "longest_pause_s": 0.15,
            "rms_energy": 0.45,
            "pitch_hz": 180.0,
            "duration_s": 2.00,
            "word_count": 5,
        },
        "mood": {
            "label": "CALM",
            "confidence": 0.61,
            "stress_index": 0.39,
            "fatigue_index": 0.00,
            "quadrant": "HIGH_AROUSAL_NEGATIVE",
            "rationale": "High arousal (0.65) with negative valence (0.40) indicates mild tension.",
            "contributing_factors": [],
        },
        "processing_ms": 50,
        "mocked": True,
    }
