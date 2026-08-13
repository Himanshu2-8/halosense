# IMPLEMENTATION.md — Step-by-Step Build Guide

> **This is the implementation playbook.** Each lane follows their section
> step by step. Every file, every command, every piece of code is specified.
> If you're an AI coding agent: do exactly what your lane section says, in order.

---

## Table of Contents

1. [Shared Setup (Everyone Does This First)](#1-shared-setup)
2. [Lane A — ML/Audio Pipeline](#2-lane-a--mlaudio-pipeline)
3. [Lane B — Backend + Data](#3-lane-b--backend--data)
4. [Lane C — Frontend](#4-lane-c--frontend)
5. [Integration (All Lanes Together)](#5-integration)
6. [Deployment](#6-deployment)

---

## 1. Shared Setup

**Every team member does these steps first, before any lane-specific work.**

### 1.1 Clone the repo

```powershell
# Windows
git clone https://github.com/<your-org>/AI_Race_GrandPrix.git
cd AI_Race_GrandPrix
```

```bash
# macOS
git clone https://github.com/<your-org>/AI_Race_GrandPrix.git
cd AI_Race_GrandPrix
```

### 1.2 Read the docs

Read these files in order. Spend 15 minutes here, it saves hours later:

1. `CLAUDE.md` (2 min)
2. `docs/CONTRACT.md` (10 min — read carefully, especially §2 naming rules and §4 core objects)
3. Your lane's section in this file

### 1.3 Create your branch

```bash
# Lane A
git checkout -b lane-a/ml-pipeline

# Lane B
git checkout -b lane-b/backend-data

# Lane C
git checkout -b lane-c/frontend
```

### 1.4 Create HuggingFace accounts

Every team member needs a HuggingFace account. Go to https://huggingface.co/join. This is a hard requirement from the hackathon rules.

---

## 2. Lane A — ML/Audio Pipeline

### What you deliver

Four Python files in `backend/app/services/` that, when combined, expose a single function:

```python
from app.services.fusion_service import analyze_audio
result = analyze_audio("path/to/clip.wav", device="cuda")
```

### Prerequisites

- Python 3.11+
- NVIDIA GPU recommended (RTX 5070 Ti, or Colab)
- ~4 GB disk for model weights

### Step A.1: Set up Python environment

```powershell
# Windows (PowerShell)
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
pip install transformers numpy soundfile librosa scipy
```

```bash
# macOS
cd backend
python3 -m venv .venv
source .venv/bin/activate

pip install torch torchvision torchaudio
pip install transformers numpy soundfile librosa scipy
```

> **⚠️ Windows CUDA trap**: If you have a Blackwell GPU (RTX 50xx), you need CUDA 12.8+. The default `pip install torch` may install CUDA 12.4, which silently falls back to CPU. Always specify `--index-url https://download.pytorch.org/whl/cu128`. Verify with:
> ```python
> import torch; print(torch.cuda.is_available(), torch.version.cuda)
> ```
> Must print `True 12.8` (or higher). If it prints `False`, your torch build is wrong.

### Step A.2: Create `backend/app/services/__init__.py`

```python
# backend/app/services/__init__.py
# This file intentionally left mostly empty.
# Services are imported where needed, not at package level,
# to avoid importing torch when MOCK_ML=1.
```

### Step A.3: Create `asr_service.py`

Create file: `backend/app/services/asr_service.py`

```python
"""
ASR Service — Whisper transcription with word-level timestamps.

Model: openai/whisper-small
Input: Path to audio file
Output: {"transcript": str, "words": [...], "asr_model": str}

Lane: A
"""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Lazy-loaded singleton
_pipe = None


def _get_pipeline(device: str):
    """Load the Whisper pipeline once and cache it."""
    global _pipe
    if _pipe is not None:
        return _pipe
    
    from transformers import pipeline as hf_pipeline
    import torch
    
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
    
    # Run inference with word timestamps
    result = pipe(
        wav_path,
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
            words.append({
                "word": word_text,
                "start": round(float(ts[0]), 3),
                "end": round(float(ts[1]), 3),
            })
    
    return {
        "transcript": transcript,
        "words": words,
        "asr_model": "openai/whisper-small",
    }
```

### Step A.4: Create `emotion_service.py`

Create file: `backend/app/services/emotion_service.py`

```python
"""
Emotion Service — Dimensional emotion from speech using audeering wav2vec2.

Model: audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim
Input: 1D float32 numpy waveform at 16kHz
Output: {"arousal": float, "dominance": float, "valence": float}

⚠️ This model has NO AutoModel support. Custom classes are REQUIRED.

Lane: A
"""

import logging
import numpy as np
import torch
import torch.nn as nn
from transformers import Wav2Vec2PreTrainedModel, Wav2Vec2Model, Wav2Vec2Processor

logger = logging.getLogger(__name__)

MODEL_ID = "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim"


# ─────────────────────────────────────────────────────────────────────
# Custom model classes — REQUIRED for the audeering model.
# Do NOT delete these. There is no alternative.
# ─────────────────────────────────────────────────────────────────────

class RegressionHead(nn.Module):
    """Regression head for dimensional emotion prediction."""
    
    def __init__(self, config):
        super().__init__()
        self.dense = nn.Linear(config.hidden_size, config.hidden_size)
        self.dropout = nn.Dropout(config.final_dropout)
        self.out_proj = nn.Linear(config.hidden_size, config.num_labels)

    def forward(self, features, **kwargs):
        x = features
        x = self.dropout(x)
        x = self.dense(x)
        x = torch.tanh(x)
        x = self.dropout(x)
        x = self.out_proj(x)
        return x


class EmotionModel(Wav2Vec2PreTrainedModel):
    """wav2vec2 model with a regression head for dimensional emotion."""
    
    def __init__(self, config):
        super().__init__(config)
        self.config = config
        self.wav2vec2 = Wav2Vec2Model(config)
        self.classifier = RegressionHead(config)
        self.init_weights()

    def forward(self, input_values):
        outputs = self.wav2vec2(input_values)
        hidden_states = outputs.last_hidden_state
        hidden_states = torch.mean(hidden_states, dim=1)
        logits = self.classifier(hidden_states)
        return hidden_states, logits


# ─────────────────────────────────────────────────────────────────────
# Lazy-loaded singletons
# ─────────────────────────────────────────────────────────────────────

_processor = None
_model = None


def _load_model(device: str):
    """Load the audeering model and processor once."""
    global _processor, _model
    if _model is not None:
        return _processor, _model
    
    logger.info(f"Loading emotion model ({MODEL_ID})...")
    _processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
    _model = EmotionModel.from_pretrained(MODEL_ID)
    
    resolved = device
    if device == "auto":
        resolved = "cuda" if torch.cuda.is_available() else "cpu"
    
    _model = _model.to(resolved)
    _model.eval()
    logger.info(f"Emotion model loaded on {resolved}.")
    return _processor, _model


def analyze_emotion(
    waveform: np.ndarray,
    sr: int = 16000,
    device: str = "auto",
) -> dict:
    """
    Analyze dimensional emotion from a waveform.
    
    Args:
        waveform: 1D numpy float32 array, mono audio
        sr: Sample rate (must be 16000)
        device: "auto" | "cuda" | "mps" | "cpu"
    
    Returns:
        {"arousal": float, "dominance": float, "valence": float}
        Each value is 0.0–1.0.
    """
    processor, model = _load_model(device)
    
    # Ensure correct shape and dtype
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    waveform = waveform.astype(np.float32)
    
    # Process
    inputs = processor(waveform, sampling_rate=sr, return_tensors="pt", padding=True)
    
    dev = next(model.parameters()).device
    input_values = inputs["input_values"].to(dev)
    
    with torch.no_grad():
        _, logits = model(input_values)
    
    # logits shape: (1, 3) → [arousal, dominance, valence]
    scores = logits[0].cpu().numpy()
    
    arousal   = float(max(0.0, min(1.0, scores[0])))
    dominance = float(max(0.0, min(1.0, scores[1])))
    valence   = float(max(0.0, min(1.0, scores[2])))
    
    return {
        "arousal": round(arousal, 4),
        "dominance": round(dominance, 4),
        "valence": round(valence, 4),
    }
```

### Step A.5: Create `prosody_service.py`

Create file: `backend/app/services/prosody_service.py`

```python
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
        voiced_duration = sum(
            max(0, w["end"] - w["start"]) for w in words
        )
        speech_rate_wps = (
            word_count / voiced_duration if voiced_duration > 0.01 else None
        )
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
```

### Step A.6: Create `fusion_service.py`

Create file: `backend/app/services/fusion_service.py`

**This is the full file. Copy the exact code from [SERVICES.md §4](SERVICES.md#service-4-fusion-service-fusion_servicepy--lane-a).** It contains:
- `_resolve_device()` — auto-detect CUDA/MPS/CPU
- `_compute_mood()` — the rule-based mood fusion logic
- `analyze_audio()` — the main entry point that orchestrates everything

The complete code is already in SERVICES.md §4. Copy it directly.

### Step A.7: Test your pipeline

Create a quick test script:

```python
# test_pipeline.py (run from backend/ directory with venv active)
import sys
sys.path.insert(0, ".")
from app.services.fusion_service import analyze_audio

# Use any short WAV file for testing
result = analyze_audio("../data/clips/ham_silverstone_2021_l52.wav", device="auto")

import json
print(json.dumps(result, indent=2))

# Verify the output matches CONTRACT.md
assert "transcript" in result
assert "words" in result
assert "prosody" in result
assert "mood" in result
assert result["mood"]["label"] in ("CALM", "STRESSED", "TIRED", "UNKNOWN")
assert 0 <= result["mood"]["stress_index"] <= 1
assert 0 <= result["mood"]["fatigue_index"] <= 1
print("\n✅ Pipeline test passed!")
```

```powershell
# Windows
cd backend
.\.venv\Scripts\Activate.ps1
python test_pipeline.py
```

### Step A.8: Push your work

```bash
# Format and lint before committing
ruff format backend/
ruff check --fix backend/

git add backend/app/services/asr_service.py
git add backend/app/services/emotion_service.py
git add backend/app/services/prosody_service.py
git add backend/app/services/fusion_service.py
git add backend/app/services/__init__.py
git commit -m "feat(lane-a): ML pipeline - ASR, emotion, prosody, fusion"
git push origin lane-a/ml-pipeline
```

---

## 3. Lane B — Backend + Data

### What you deliver

A fully working FastAPI application with all routes, schemas, cache, lap data, and contract tests. It must boot in <2 seconds with `MOCK_ML=1`.

### Prerequisites

- Python 3.11+
- No GPU needed (works with `MOCK_ML=1`)

### Step B.1: Set up Python environment

```powershell
# Windows
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install fastapi uvicorn[standard] pydantic python-multipart
pip install numpy scipy pandas fastf1
```

```bash
# macOS
cd backend
python3 -m venv .venv
source .venv/bin/activate

pip install fastapi uvicorn[standard] pydantic python-multipart
pip install numpy scipy pandas fastf1
```

### Step B.2: Create `requirements.txt`

```
# backend/requirements.txt
# Core
fastapi>=0.104.0
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
python-multipart>=0.0.6

# ML (Lane A) — only needed when MOCK_ML=0
torch>=2.0.0
transformers>=4.36.0
soundfile>=0.12.0
numpy>=1.24.0
librosa>=0.10.0

# Data (Lane B)
scipy>=1.11.0
pandas>=2.0.0

# Data collection scripts only (not needed at runtime)
# fastf1>=3.3.0
```

### Step B.3: Create `backend/app/__init__.py`

```python
# backend/app/__init__.py
```

(Empty file — just makes it a Python package.)

### Step B.4: Create `backend/app/config.py`

```python
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
    
    class Config:
        env_file = str(_BACKEND_DIR / ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"
    
    def resolve_path(self, relative_path: str) -> Path:
        """Resolve a path relative to the project root."""
        return _PROJECT_ROOT / relative_path


# Singleton
settings = Settings()
```

> **⚠️ Note**: You need `pydantic-settings` for `BaseSettings`:
> ```
> pip install pydantic-settings
> ```
> Add it to `requirements.txt`.

### Step B.5: Create `backend/app/schemas.py`

Copy **all Pydantic models** exactly from [CONTRACT.md §3–§4](../docs/CONTRACT.md). The enums, the six core objects, and the error response:

```python
"""
Pydantic schemas — the single source of truth for all JSON shapes.
These MUST match CONTRACT.md exactly. If they diverge, CONTRACT.md wins.
"""

from enum import Enum
from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────

class MoodLabel(str, Enum):
    CALM     = "CALM"
    STRESSED = "STRESSED"
    TIRED    = "TIRED"
    UNKNOWN  = "UNKNOWN"


class Quadrant(str, Enum):
    HIGH_AROUSAL_NEGATIVE = "HIGH_AROUSAL_NEGATIVE"
    HIGH_AROUSAL_POSITIVE = "HIGH_AROUSAL_POSITIVE"
    LOW_AROUSAL_NEGATIVE  = "LOW_AROUSAL_NEGATIVE"
    LOW_AROUSAL_POSITIVE  = "LOW_AROUSAL_POSITIVE"


class TrendDirection(str, Enum):
    IMPROVING = "IMPROVING"
    STABLE    = "STABLE"
    DEGRADING = "DEGRADING"


# ── Core objects ───────────────────────────────────────────────────

class WordTiming(BaseModel):
    word:  str
    start: float
    end:   float


class ProsodyFeatures(BaseModel):
    arousal:   float = Field(..., ge=0.0, le=1.0)
    dominance: float = Field(..., ge=0.0, le=1.0)
    valence:   float = Field(..., ge=0.0, le=1.0)
    speech_rate_wps: float | None = None
    pause_ratio:     float | None = Field(None, ge=0.0, le=1.0)
    mean_pause_s:    float | None = None
    longest_pause_s: float | None = None
    rms_energy:  float | None = Field(None, ge=0.0, le=1.0)
    pitch_hz:    float | None = None
    duration_s:  float
    word_count:  int


class MoodVerdict(BaseModel):
    label:      MoodLabel
    confidence: float = Field(..., ge=0.0, le=1.0)
    stress_index:  float = Field(..., ge=0.0, le=1.0)
    fatigue_index: float = Field(..., ge=0.0, le=1.0)
    quadrant: Quadrant
    rationale: str
    contributing_factors: list[str] = []


class LapPoint(BaseModel):
    lap_number: int
    lap_time_s: float | None = None
    delta_s:    float | None = None
    compound:   str | None = None
    stint:      int | None = None
    tyre_life:  int | None = None
    is_pit_lap: bool = False
    is_accurate: bool = True
    track_status: str | None = None
    is_radio_lap: bool = False


class LapSeries(BaseModel):
    driver:    str
    race:      str
    baseline_s: float | None = None
    total_laps: int
    laps:      list[LapPoint]


class LapContext(BaseModel):
    lap_number:      int
    lap_time_s:      float | None = None
    baseline_s:      float | None = None
    delta_s:         float | None = None
    next_lap_delta_s: float | None = None
    prev_lap_delta_s: float | None = None
    compound:        str | None = None
    trend:           TrendDirection
    window: list[LapPoint] = []


class ClipAnalysis(BaseModel):
    clip_id: str
    source:  str
    driver: str | None = None
    race:   str | None = None
    lap:    int | None = None
    session_type: str | None = None
    transcript: str
    words: list[WordTiming] = []
    asr_model: str
    prosody: ProsodyFeatures
    mood:    MoodVerdict
    lap_context: LapContext | None = None
    audio_url: str
    processed_at: str
    processing_ms: int
    mocked: bool = False


class ClipSummary(BaseModel):
    clip_id:    str
    driver:     str | None = None
    race:       str | None = None
    lap:        int | None = None
    duration_s: float
    mood_label: MoodLabel
    stress_index: float
    delta_s:    float | None = None
    transcript_preview: str
    audio_url:  str


class CorrelationPoint(BaseModel):
    clip_id:      str
    driver:       str | None = None
    stress_index: float
    delta_s:      float
    mood_label:   MoodLabel


class CorrelationSummary(BaseModel):
    n: int
    pearson_r: float | None = None
    p_value:   float | None = None
    pearson_r_next_lap: float | None = None
    mean_delta_by_mood: dict[str, float] = {}
    points: list[CorrelationPoint] = []
    headline: str


class HealthStatus(BaseModel):
    status: str = "ok"
    mock_ml: bool
    models_loaded: bool
    clip_count: int
    version: str = "1.0.0"


class EvalSummary(BaseModel):
    n_labeled: int = 0
    agreement_rate: float | None = None
    confusion_matrix: dict | None = None
    mean_stress_by_human_label: dict | None = None
    notes: str = ""


class ErrorResponse(BaseModel):
    error: str
    detail: str
    hint: str | None = None
```

### Step B.6: Create `backend/app/main.py`

```python
"""
FastAPI application entry point.
Run with: uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings


logging.basicConfig(level=settings.LOG_LEVEL.upper())
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info(f"Starting Silent Co-Driver API (MOCK_ML={settings.MOCK_ML})")
    # Pre-load the cache on startup
    from app.services.cache_service import get_cache
    cache = get_cache()
    logger.info(f"Loaded {len(cache)} clips from cache.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title="Silent Co-Driver API",
    description="F1 driver stress detection from team radio audio",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ───────────────────────────────────────────────────────
from app.routes.health import router as health_router
from app.routes.clips import router as clips_router
from app.routes.analyze import router as analyze_router
from app.routes.laps import router as laps_router
from app.routes.correlation import router as correlation_router
from app.routes.audio import router as audio_router
from app.routes.eval_route import router as eval_router

app.include_router(health_router, prefix="/api")
app.include_router(clips_router, prefix="/api")
app.include_router(analyze_router, prefix="/api")
app.include_router(laps_router, prefix="/api")
app.include_router(correlation_router, prefix="/api")
app.include_router(audio_router, prefix="/api")
app.include_router(eval_router, prefix="/api")
```

### Step B.7: Create all route files

Create each route file following the exact specifications in [ROUTES.md](ROUTES.md). Each route file has the complete implementation code there.

Files to create:
- `backend/app/routes/__init__.py` (empty)
- `backend/app/routes/health.py` (from ROUTES.md §1)
- `backend/app/routes/clips.py` (from ROUTES.md §2 + §3)
- `backend/app/routes/analyze.py` (from ROUTES.md §4)
- `backend/app/routes/laps.py` (from ROUTES.md §5)
- `backend/app/routes/correlation.py` (from ROUTES.md §6)
- `backend/app/routes/audio.py` (from ROUTES.md §7)
- `backend/app/routes/eval_route.py` (from ROUTES.md §8)

### Step B.8: Create service files

Create each service file following [SERVICES.md](SERVICES.md):
- `backend/app/services/__init__.py` (empty or minimal)
- `backend/app/services/cache_service.py` (from SERVICES.md §5)
- `backend/app/services/lap_service.py` (from SERVICES.md §6)
- `backend/app/services/correlation_service.py` (from SERVICES.md §7)

### Step B.9: Create mock data fixture

Create `data/cache/analyses.json` with 5 mock clips. See [CONTRACT.md §6](../docs/CONTRACT.md#6-the-mock-fixture-this-is-what-unblocks-everyone) for the required clips.

Create `data/metadata.csv`:
```csv
clip_id,driver,race,lap,session_type,source_url,notes
ham_silverstone_2021_l52,HAM,Silverstone 2021,52,R,,Bono my tyres are gone
rai_abu_dhabi_2018_l53,RAI,Abu Dhabi 2018,53,R,,Leave me alone I know what I'm doing
vet_germany_2018_l52,VET,Germany 2018,52,R,,End of a difficult race - tired
upload_mock_001,,,,,,Mock upload with no metadata
ham_hungary_2021_l45,HAM,Hungary 2021,45,R,,Long radio message about strategy
```

Create `data/labels.csv` (empty template):
```csv
clip_id,human_mood,human_stress_1to5,labeler
```

Create empty directories:
- `data/clips/` (put a `.gitkeep` file)
- `data/laps/` (put a `.gitkeep` file)
- `data/uploads/` (in `.gitignore`)

### Step B.10: Create `scripts/fetch_laps.py`

```python
"""
Fetch lap data from FastF1 and dump to data/laps/ as JSON.

Run once locally, commit the output. NEVER call FastF1 at runtime.

Usage:
    cd backend && python -m scripts.fetch_laps
    
Or from project root:
    python scripts/fetch_laps.py
"""

import json
import math
import sys
from pathlib import Path

import fastf1
import pandas as pd

# ── Configuration ────────────────────────────────────────────────

# Sessions to fetch — add more as you add clips to your dataset
SESSIONS = [
    # (year, round_number or GP name, session_type, driver_code)
    (2021, "British Grand Prix", "R", "HAM"),
    (2018, "Abu Dhabi Grand Prix", "R", "RAI"),
    (2018, "German Grand Prix", "R", "VET"),
    (2021, "Hungarian Grand Prix", "R", "HAM"),
    # Add more as needed...
]

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "laps"
CACHE_DIR = Path(__file__).resolve().parent.parent / "backend" / ".fastf1_cache"


def clean(value):
    """Convert pandas/numpy missing values to None for JSON safety."""
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return None
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def td_to_seconds(td) -> float | None:
    """Convert pandas Timedelta to float seconds."""
    if td is None or pd.isna(td):
        return None
    return round(float(pd.Timedelta(td).total_seconds()), 3)


def fetch_session(year, gp, session_type, driver):
    """Fetch and process lap data for one driver in one session."""
    print(f"Fetching {driver} @ {gp} {year} ({session_type})...")
    
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    session = fastf1.get_session(year, gp, session_type)
    session.load()
    
    driver_laps = session.laps.pick_drivers(driver)
    
    # Compute baseline (median of clean laps)
    clean_laps = driver_laps[
        (driver_laps["IsAccurate"] == True) &
        (~driver_laps["PitInTime"].notna() | ~driver_laps["PitOutTime"].notna())
    ]
    clean_times = [td_to_seconds(t) for t in clean_laps["LapTime"] if pd.notna(t)]
    clean_times = [t for t in clean_times if t is not None]
    
    import numpy as np
    baseline_s = round(float(np.median(clean_times)), 3) if clean_times else None
    
    laps = []
    for _, lap in driver_laps.iterrows():
        lap_time_s = td_to_seconds(lap["LapTime"])
        delta_s = round(lap_time_s - baseline_s, 3) if (lap_time_s and baseline_s) else None
        
        is_pit = bool(pd.notna(lap.get("PitInTime")) or pd.notna(lap.get("PitOutTime")))
        
        laps.append({
            "lap_number": int(clean(lap["LapNumber"]) or 0),
            "lap_time_s": lap_time_s,
            "delta_s": delta_s,
            "compound": clean(lap.get("Compound")),
            "stint": int(clean(lap.get("Stint")) or 0) if clean(lap.get("Stint")) else None,
            "tyre_life": int(clean(lap.get("TyreLife")) or 0) if clean(lap.get("TyreLife")) else None,
            "is_pit_lap": is_pit,
            "is_accurate": bool(clean(lap.get("IsAccurate"))),
            "track_status": clean(lap.get("TrackStatus")),
            "is_radio_lap": False,  # Will be set by lap_service at runtime
        })
    
    # Build race name
    race_name = f"{session.event['EventName']} {year}"
    # Simplify: "British Grand Prix 2021" → "Silverstone 2021" etc.
    # For now, just use the event name
    
    return {
        "driver": driver,
        "race": race_name,
        "session_key": f"{year}_{session.event['RoundNumber']}_{session_type}",
        "baseline_s": baseline_s,
        "laps": laps,
    }


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    for year, gp, stype, driver in SESSIONS:
        try:
            data = fetch_session(year, gp, stype, driver)
            filename = f"{driver.lower()}_{data['race'].lower().replace(' ', '_')}.json"
            out_path = OUTPUT_DIR / filename
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"  ✅ Saved to {out_path}")
        except Exception as e:
            print(f"  ❌ Failed: {e}")


if __name__ == "__main__":
    main()
```

### Step B.11: Create contract tests

Create `backend/tests/__init__.py` (empty) and `backend/tests/test_contract.py`:

```python
"""
Contract tests — validate that mock data matches schemas.
Run with: pytest backend/tests/test_contract.py
"""

import json
import math
from pathlib import Path

import pytest

# Add backend to path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.schemas import (
    ClipAnalysis, MoodLabel, Quadrant, TrendDirection,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CACHE_FILE = PROJECT_ROOT / "data" / "cache" / "analyses.json"


def load_cache():
    if not CACHE_FILE.exists():
        pytest.skip(f"Cache file not found: {CACHE_FILE}")
    with open(CACHE_FILE, "r") as f:
        return json.load(f)


class TestContract:
    """Validate that all cached data obeys the CONTRACT."""
    
    def test_cache_is_valid_json(self):
        data = load_cache()
        assert isinstance(data, list), "analyses.json must be a JSON array"
        assert len(data) >= 1, "analyses.json must have at least 1 clip"
    
    def test_every_clip_validates(self):
        data = load_cache()
        for item in data:
            clip = ClipAnalysis(**item)
            assert clip.clip_id, "clip_id must not be empty"
    
    def test_no_nan_in_json(self):
        raw = CACHE_FILE.read_text()
        assert "NaN" not in raw, "NaN found in analyses.json — see CONTRACT.md §9"
        assert "Infinity" not in raw, "Infinity found in analyses.json"
        assert "-Infinity" not in raw, "-Infinity found in analyses.json"
    
    def test_scores_in_range(self):
        data = load_cache()
        for item in data:
            prosody = item["prosody"]
            assert 0 <= prosody["arousal"] <= 1, f"arousal out of range: {prosody['arousal']}"
            assert 0 <= prosody["dominance"] <= 1
            assert 0 <= prosody["valence"] <= 1
            
            mood = item["mood"]
            assert 0 <= mood["stress_index"] <= 1
            assert 0 <= mood["fatigue_index"] <= 1
            assert 0 <= mood["confidence"] <= 1
    
    def test_valid_enum_values(self):
        data = load_cache()
        for item in data:
            MoodLabel(item["mood"]["label"])
            Quadrant(item["mood"]["quadrant"])
            if item.get("lap_context"):
                TrendDirection(item["lap_context"]["trend"])
    
    def test_audio_urls_are_valid(self):
        data = load_cache()
        for item in data:
            url = item["audio_url"]
            assert url.startswith("/api/audio/"), f"Bad audio_url: {url}"
            clip_id = url.split("/")[-1]
            assert clip_id == item["clip_id"]
```

### Step B.12: Create `.env` and test

```powershell
# Windows
Copy-Item backend\.env.example backend\.env
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/api/health` — should return JSON with `mock_ml: true`.

### Step B.13: Push your work

```bash
# Format, lint, and test before committing
ruff format backend/ scripts/
ruff check --fix backend/ scripts/
pytest backend/tests/test_contract.py

git add backend/app/ backend/tests/ backend/requirements.txt
git add scripts/ data/
git commit -m "feat(lane-b): Backend API, data layer, cache, contract tests"
git push origin lane-b/backend-data
```

---

## 4. Lane C — Frontend

### What you deliver

A complete Next.js application with all components, rendering from mock data when `NEXT_PUBLIC_USE_MOCKS=1`.

### Prerequisites

- Node.js 18+ and npm
- No Python needed

### Step C.1: Create Next.js app

```powershell
# Windows (from project root)
cd frontend
npx -y create-next-app@latest ./ --typescript --eslint --tailwind --src-dir --app --no-import-alias
```

```bash
# macOS
cd frontend
npx -y create-next-app@latest ./ --typescript --eslint --tailwind --src-dir --app --no-import-alias
```

> If it asks questions interactively, choose: TypeScript=Yes, ESLint=Yes, Tailwind=Yes, src/=Yes, App Router=Yes, import alias=No.

### Step C.2: Install additional dependencies

```bash
cd frontend
npm install recharts wavesurfer.js
```

### Step C.3: Create `frontend/src/lib/types.ts`

Copy the TypeScript types from [CONTRACT.md](../docs/CONTRACT.md):

```typescript
// frontend/src/lib/types.ts
// These types mirror CONTRACT.md exactly. Do not deviate.

export type MoodLabel = "CALM" | "STRESSED" | "TIRED" | "UNKNOWN";
export type Quadrant = "HIGH_AROUSAL_NEGATIVE" | "HIGH_AROUSAL_POSITIVE" | "LOW_AROUSAL_NEGATIVE" | "LOW_AROUSAL_POSITIVE";
export type TrendDirection = "IMPROVING" | "STABLE" | "DEGRADING";

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface ProsodyFeatures {
  arousal: number;
  dominance: number;
  valence: number;
  speech_rate_wps: number | null;
  pause_ratio: number | null;
  mean_pause_s: number | null;
  longest_pause_s: number | null;
  rms_energy: number | null;
  pitch_hz: number | null;
  duration_s: number;
  word_count: number;
}

export interface MoodVerdict {
  label: MoodLabel;
  confidence: number;
  stress_index: number;
  fatigue_index: number;
  quadrant: Quadrant;
  rationale: string;
  contributing_factors: string[];
}

export interface LapPoint {
  lap_number: number;
  lap_time_s: number | null;
  delta_s: number | null;
  compound: string | null;
  stint: number | null;
  tyre_life: number | null;
  is_pit_lap: boolean;
  is_accurate: boolean;
  track_status: string | null;
  is_radio_lap: boolean;
}

export interface LapContext {
  lap_number: number;
  lap_time_s: number | null;
  baseline_s: number | null;
  delta_s: number | null;
  next_lap_delta_s: number | null;
  prev_lap_delta_s: number | null;
  compound: string | null;
  trend: TrendDirection;
  window: LapPoint[];
}

export interface ClipAnalysis {
  clip_id: string;
  source: string;
  driver: string | null;
  race: string | null;
  lap: number | null;
  session_type: string | null;
  transcript: string;
  words: WordTiming[];
  asr_model: string;
  prosody: ProsodyFeatures;
  mood: MoodVerdict;
  lap_context: LapContext | null;
  audio_url: string;
  processed_at: string;
  processing_ms: number;
  mocked: boolean;
}

export interface ClipSummary {
  clip_id: string;
  driver: string | null;
  race: string | null;
  lap: number | null;
  duration_s: number;
  mood_label: MoodLabel;
  stress_index: number;
  delta_s: number | null;
  transcript_preview: string;
  audio_url: string;
}

export interface CorrelationPoint {
  clip_id: string;
  driver: string | null;
  stress_index: number;
  delta_s: number;
  mood_label: MoodLabel;
}

export interface CorrelationSummary {
  n: number;
  pearson_r: number | null;
  p_value: number | null;
  pearson_r_next_lap: number | null;
  mean_delta_by_mood: Record<string, number>;
  points: CorrelationPoint[];
  headline: string;
}

export interface HealthStatus {
  status: string;
  mock_ml: boolean;
  models_loaded: boolean;
  clip_count: number;
  version: string;
}
```

### Step C.4: Create `frontend/src/lib/mock.ts`

Create the 5-clip mock data fixture. This is your entire data source until integration. Make it match [CONTRACT.md §6](../docs/CONTRACT.md#6-the-mock-fixture-this-is-what-unblocks-everyone) requirements.

The mock must include all 5 clip variants listed in AGENTS.md §12.

### Step C.5: Create `frontend/src/lib/api.ts`

```typescript
// frontend/src/lib/api.ts
import type { ClipAnalysis, ClipSummary, CorrelationSummary, HealthStatus } from "./types";
import { MOCK_CLIPS, MOCK_CORRELATION } from "./mock";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "1";

export async function fetchHealth(): Promise<HealthStatus> {
  if (USE_MOCKS) {
    return { status: "ok", mock_ml: true, models_loaded: false, clip_count: MOCK_CLIPS.length, version: "1.0.0" };
  }
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error("Backend unreachable");
  return res.json();
}

export async function fetchClips(driver?: string, mood?: string): Promise<ClipSummary[]> {
  if (USE_MOCKS) {
    return MOCK_CLIPS.map((c) => ({
      clip_id: c.clip_id,
      driver: c.driver,
      race: c.race,
      lap: c.lap,
      duration_s: c.prosody.duration_s,
      mood_label: c.mood.label,
      stress_index: c.mood.stress_index,
      delta_s: c.lap_context?.delta_s ?? null,
      transcript_preview: c.transcript.length > 60 ? c.transcript.slice(0, 57) + "..." : c.transcript,
      audio_url: c.audio_url,
    }));
  }
  const params = new URLSearchParams();
  if (driver) params.set("driver", driver);
  if (mood) params.set("mood", mood);
  const res = await fetch(`${API_BASE}/api/clips?${params}`);
  if (!res.ok) throw new Error("Failed to fetch clips");
  return res.json();
}

export async function fetchClip(clipId: string): Promise<ClipAnalysis> {
  if (USE_MOCKS) {
    const clip = MOCK_CLIPS.find((c) => c.clip_id === clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);
    return clip;
  }
  const res = await fetch(`${API_BASE}/api/clips/${clipId}`);
  if (!res.ok) throw new Error("Failed to fetch clip");
  return res.json();
}

export async function analyzeAudio(file: File, metadata?: { driver?: string; race?: string; lap?: number }): Promise<ClipAnalysis> {
  if (USE_MOCKS) {
    // Simulate a delay
    await new Promise((r) => setTimeout(r, 1500));
    return MOCK_CLIPS[0]; // Return first mock clip as "analysis result"
  }
  const formData = new FormData();
  formData.append("file", file);
  if (metadata?.driver) formData.append("driver", metadata.driver);
  if (metadata?.race) formData.append("race", metadata.race);
  if (metadata?.lap) formData.append("lap", String(metadata.lap));
  
  const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Analysis failed" }));
    throw new Error(err.detail || "Analysis failed");
  }
  return res.json();
}

export async function fetchCorrelation(): Promise<CorrelationSummary> {
  if (USE_MOCKS) return MOCK_CORRELATION;
  const res = await fetch(`${API_BASE}/api/correlation`);
  if (!res.ok) throw new Error("Failed to fetch correlation");
  return res.json();
}

export function getAudioUrl(clipId: string): string {
  if (USE_MOCKS) return ""; // No real audio in mock mode
  return `${API_BASE}/api/audio/${clipId}`;
}
```

### Step C.6: Build components

Build each component from the component map in [AGENTS.md §11](AGENTS.md#11-frontend-component-map). Priority order:

1. **`MoodCard.tsx`** — The hero visual. Big label, confidence bar, contributing factor chips.
2. **`Sidebar.tsx`** — Clip list with mood pills.
3. **`LapChart.tsx`** — Recharts line chart with stress markers.
4. **`TranscriptView.tsx`** — Word-by-word display.
5. **`AudioPlayer.tsx`** — WaveSurfer.js waveform.
6. **`CorrelationPlot.tsx`** — Scatter chart.
7. **`UploadPanel.tsx`** — File drag-and-drop.
8. **`ArousalValenceGauge.tsx`** — 2D circumplex plot.
9. **`DevBanner.tsx`** — Mock mode warning.

### Design guidance

- **Color scheme**: Dark theme (background `#0a0a0f` or similar), with accent colors:
  - STRESSED: `#ef4444` (red)
  - CALM: `#22c55e` (green)
  - TIRED: `#f59e0b` (amber)
  - UNKNOWN: `#6b7280` (gray)
- **Font**: Use Inter or similar modern sans-serif from Google Fonts
- **Animations**: Subtle transitions on mood card changes, pulse on stress markers
- **F1 feel**: Use racing-inspired design cues (carbon fiber textures, speed lines, timing-board aesthetics)

### Step C.7: Set up `.env.local`

```powershell
# Windows
Copy-Item frontend\.env.local.example frontend\.env.local
```

### Step C.8: Run and test

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`. With `NEXT_PUBLIC_USE_MOCKS=1`, everything should render from mock data.

### Step C.9: Push your work

```bash
# Format and test build before committing
npx prettier --write .
npm run build

git add frontend/
git commit -m "feat(lane-c): Frontend - all components, mock data, styling"
git push origin lane-c/frontend
```

---

## 5. Integration

**When**: After all three lanes have pushed their work.

**Who**: Ideally everyone together, but at minimum the person with the most Git experience.

### Step 5.1: Merge lanes into main

```bash
git checkout main
git pull origin main

# Merge Lane A first (ML pipeline — fewest files, least likely to conflict)
git merge origin/lane-a/ml-pipeline

# Merge Lane B (backend + data)
git merge origin/lane-b/backend-data

# Merge Lane C (frontend — entirely separate directory, zero conflicts expected)
git merge origin/lane-c/frontend

git push origin main
```

### Step 5.2: Test backend with real ML

```powershell
cd backend
# Edit .env: set MOCK_ML=0
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

Test: `http://localhost:8000/api/health` should show `mock_ml: false`.
Test: `http://localhost:8000/api/clips` should return the mock fixture data.

### Step 5.3: Test frontend with real backend

```powershell
cd frontend
# Edit .env.local: set NEXT_PUBLIC_USE_MOCKS=0
npm run dev
```

Open `http://localhost:3000`. Verify:
- Sidebar loads clips from the real API
- Clicking a clip shows real analysis data
- Upload panel sends to `/api/analyze` and shows results

### Step 5.4: Run contract tests

```bash
cd backend
pytest tests/test_contract.py -v
```

All tests must pass before recording the demo video.

---

## 6. Deployment

### 6.1: Backend → HuggingFace Docker Space

Create `backend/Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Copy data (the precomputed cache + clips)
COPY ../data/ /app/data/

# Environment
ENV MOCK_ML=0
ENV PORT=7860

EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
```

### 6.2: Frontend → Vercel

1. Connect repo to Vercel
2. Set root directory: `frontend`
3. Set environment variables:
   - `NEXT_PUBLIC_API_BASE` = `https://<username>-silent-codriver.hf.space`
   - `NEXT_PUBLIC_USE_MOCKS` = `0`
   - `NEXT_PUBLIC_SHOW_DEV_BANNER` = `0`

---

## Appendix: File Creation Checklist

### Lane A creates these files:
- [ ] `backend/app/services/__init__.py`
- [ ] `backend/app/services/asr_service.py`
- [ ] `backend/app/services/emotion_service.py`
- [ ] `backend/app/services/prosody_service.py`
- [ ] `backend/app/services/fusion_service.py`

### Lane B creates these files:
- [ ] `backend/app/__init__.py`
- [ ] `backend/app/main.py`
- [ ] `backend/app/config.py`
- [ ] `backend/app/schemas.py`
- [ ] `backend/app/routes/__init__.py`
- [ ] `backend/app/routes/health.py`
- [ ] `backend/app/routes/clips.py`
- [ ] `backend/app/routes/analyze.py`
- [ ] `backend/app/routes/laps.py`
- [ ] `backend/app/routes/correlation.py`
- [ ] `backend/app/routes/audio.py`
- [ ] `backend/app/routes/eval_route.py`
- [ ] `backend/app/services/cache_service.py`
- [ ] `backend/app/services/lap_service.py`
- [ ] `backend/app/services/correlation_service.py`
- [ ] `backend/requirements.txt`
- [ ] `backend/Dockerfile`
- [ ] `backend/tests/__init__.py`
- [ ] `backend/tests/test_contract.py`
- [ ] `scripts/fetch_laps.py`
- [ ] `scripts/precompute.py`
- [ ] `data/metadata.csv`
- [ ] `data/labels.csv`
- [ ] `data/cache/analyses.json`
- [ ] `data/clips/.gitkeep`
- [ ] `data/laps/.gitkeep`

### Lane C creates these files:
- [ ] `frontend/` (entire Next.js app via `create-next-app`)
- [ ] `frontend/src/lib/types.ts`
- [ ] `frontend/src/lib/mock.ts`
- [ ] `frontend/src/lib/api.ts`
- [ ] `frontend/src/components/Sidebar.tsx`
- [ ] `frontend/src/components/AudioPlayer.tsx`
- [ ] `frontend/src/components/TranscriptView.tsx`
- [ ] `frontend/src/components/MoodCard.tsx`
- [ ] `frontend/src/components/ArousalValenceGauge.tsx`
- [ ] `frontend/src/components/LapChart.tsx`
- [ ] `frontend/src/components/CorrelationPlot.tsx`
- [ ] `frontend/src/components/UploadPanel.tsx`
- [ ] `frontend/src/components/DevBanner.tsx`
- [ ] `frontend/src/components/LoadingStates.tsx`
- [ ] `frontend/src/app/layout.tsx`
- [ ] `frontend/src/app/page.tsx`
- [ ] `frontend/src/app/globals.css`
