"""
Application configuration — reads from .env file.
Every value has a sane default so the app boots with an empty .env.
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings


# Resolve project root (two levels up from this file: app/config.py → backend/ → root/)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent


class Settings(BaseSettings):
    # ── Mock mode ────────────────────────────────────────────────
    MOCK_ML: bool = True

    # ── Device ───────────────────────────────────────────────────
    DEVICE: str = "auto"

    # ── Model IDs ────────────────────────────────────────────────
    ASR_MODEL_ID: str = "openai/whisper-small"
    EMOTION_MODEL_ID: str = "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim"
    TEXT_SENTIMENT_MODEL_ID: str = ""

    # ── Paths (resolved relative to project root) ────────────────
    DATA_DIR: str = "data"
    CLIPS_DIR: str = "data/clips"
    LAPS_DIR: str = "data/laps"
    CACHE_FILE: str = "data/cache/analyses.json"
    METADATA_CSV: str = "data/metadata.csv"
    LABELS_CSV: str = "data/labels.csv"
    UPLOADS_DIR: str = "data/uploads"
    FASTF1_CACHE_DIR: str = "backend/.fastf1_cache"

    # ── Upload limits ────────────────────────────────────────────
    MAX_UPLOAD_MB: int = 15
    MAX_AUDIO_SECONDS: int = 60

    # ── CORS ─────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── HuggingFace ──────────────────────────────────────────────
    HF_TOKEN: str = ""

    # ── Server ───────────────────────────────────────────────────
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    LOG_LEVEL: str = "info"

    model_config = {
        "env_file": str(_BACKEND_DIR / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    def resolve_path(self, relative_path: str) -> Path:
        """Resolve a path relative to the project root."""
        return _PROJECT_ROOT / relative_path


# Singleton
settings = Settings()
