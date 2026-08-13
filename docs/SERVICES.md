# SERVICES.md — Backend Service Specification

> **This document describes every service in `backend/app/services/`.**
> Each service is a Python module with a clear input → logic → output contract.
> Lane A builds ML services. Lane B builds data services.

---

## Service Overview

| Service | File | Lane | Purpose |
|---------|------|------|---------|
| ASR | `asr_service.py` | A | Whisper transcription + word timestamps |
| Emotion | `emotion_service.py` | A | audeering wav2vec2 → arousal/dominance/valence |
| Prosody | `prosody_service.py` | A | Speech rate, pauses, energy, pitch |
| Fusion | `fusion_service.py` | A | Combines all signals → mood verdict |
| Cache | `cache_service.py` | B | Read/write `analyses.json` |
| Lap | `lap_service.py` | B | Read FastF1 JSON, compute context |
| Correlation | `correlation_service.py` | B | Pearson r across all clips |

---

## Service 1: ASR Service (`asr_service.py`) — Lane A

### Purpose
Transcribe audio using Whisper and extract word-level timestamps.

### Input

```python
def transcribe(wav_path: str, device: str = "auto") -> dict:
    """
    Args:
        wav_path: Path to a WAV file (any sample rate, will be handled by processor)
        device: "auto" | "cuda" | "mps" | "cpu"
    
    Returns:
        {
            "transcript": str,          # Full transcript text
            "words": [                  # Word-level timestamps
                {"word": str, "start": float, "end": float},
                ...
            ],
            "asr_model": str            # Model ID actually used
        }
    """
```

### Logic

1. Load audio file using `soundfile` (or `librosa.load`)
2. If stereo, convert to mono by averaging channels
3. Load Whisper model and processor (cached after first call):
   ```python
   from transformers import pipeline
   
   # Use the pipeline API — it handles word timestamps correctly
   pipe = pipeline(
       "automatic-speech-recognition",
       model="openai/whisper-small",
       device=device_resolved,  # 0 for cuda, -1 for cpu, "mps" for Apple Silicon
   )
   ```
4. Run inference:
   ```python
   result = pipe(
       wav_path,
       return_timestamps="word",
       generate_kwargs={"language": "en", "task": "transcribe"},
   )
   # result = {
   #     "text": "Bono, my tyres are gone!",
   #     "chunks": [
   #         {"text": "Bono,", "timestamp": (0.12, 0.58)},
   #         {"text": "my",    "timestamp": (0.69, 0.81)},
   #         ...
   #     ]
   # }
   ```
5. Convert to our format:
   ```python
   words = []
   for chunk in result.get("chunks", []):
       ts = chunk.get("timestamp")
       if ts and ts[0] is not None and ts[1] is not None:
           words.append({
               "word": chunk["text"].strip(),
               "start": round(float(ts[0]), 3),
               "end": round(float(ts[1]), 3),
           })
   
   return {
       "transcript": result["text"].strip(),
       "words": words,
       "asr_model": "openai/whisper-small",
   }
   ```

### Output

```json
{
  "transcript": "Bono, my tyres are gone!",
  "words": [
    {"word": "Bono,", "start": 0.12, "end": 0.58},
    {"word": "my",    "start": 0.69, "end": 0.81},
    {"word": "tyres", "start": 0.84, "end": 1.22},
    {"word": "are",   "start": 1.26, "end": 1.41},
    {"word": "gone!", "start": 1.44, "end": 2.05}
  ],
  "asr_model": "openai/whisper-small"
}
```

### Mock output (when `MOCK_ML=1`)

```python
def transcribe_mock(wav_path: str, device: str = "auto") -> dict:
    return {
        "transcript": "Mock transcript for testing.",
        "words": [
            {"word": "Mock", "start": 0.0, "end": 0.3},
            {"word": "transcript", "start": 0.4, "end": 0.8},
            {"word": "for", "start": 0.9, "end": 1.0},
            {"word": "testing.", "start": 1.1, "end": 1.5},
        ],
        "asr_model": "openai/whisper-small",
    }
```

### Edge cases

| Case | Handling |
|------|----------|
| No speech detected | Return `{"transcript": "", "words": [], ...}` |
| Audio too short (<0.4s) | Return empty transcript; fusion will set mood to UNKNOWN |
| Very noisy audio | Whisper may hallucinate words — the fusion logic handles this by checking word_count |
| Non-16kHz input | The pipeline handles resampling internally |

### Dependencies

```
torch
transformers
soundfile
numpy
```

---

## Service 2: Emotion Service (`emotion_service.py`) — Lane A

### Purpose
Run the audeering wav2vec2 model to get dimensional emotion scores.

### Input

```python
def analyze_emotion(waveform: np.ndarray, sr: int = 16000, device: str = "auto") -> dict:
    """
    Args:
        waveform: 1D numpy array, float32, mono audio
        sr: Sample rate (must be 16000)
        device: "auto" | "cuda" | "mps" | "cpu"
    
    Returns:
        {
            "arousal": float,     # 0.0 – 1.0
            "dominance": float,   # 0.0 – 1.0
            "valence": float      # 0.0 – 1.0
        }
    """
```

### Logic

**⚠️ CRITICAL: This model requires custom PyTorch classes. There is NO AutoModel support.**

1. Define the custom model classes (copy-paste exactly):

```python
import torch
import torch.nn as nn
from transformers import Wav2Vec2PreTrainedModel, Wav2Vec2Model, Wav2Vec2Processor


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
        # Mean pool over the sequence dimension
        hidden_states = torch.mean(hidden_states, dim=1)
        logits = self.classifier(hidden_states)
        return hidden_states, logits
```

2. Load the model (once, cached):

```python
MODEL_ID = "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim"

processor = Wav2Vec2Processor.from_pretrained(MODEL_ID)
model = EmotionModel.from_pretrained(MODEL_ID).to(device)
model.eval()
```

3. Run inference:

```python
def analyze_emotion(waveform: np.ndarray, sr: int = 16000, device: str = "auto") -> dict:
    # Ensure correct shape: 1D float32
    if waveform.ndim > 1:
        waveform = waveform.mean(axis=1)
    waveform = waveform.astype(np.float32)
    
    # Process
    inputs = processor(waveform, sampling_rate=sr, return_tensors="pt", padding=True)
    input_values = inputs["input_values"].to(device)
    
    with torch.no_grad():
        _, logits = model(input_values)
    
    # logits shape: (1, 3) → [arousal, dominance, valence]
    scores = logits[0].cpu().numpy()
    
    # Clamp to [0, 1]
    arousal   = float(max(0.0, min(1.0, scores[0])))
    dominance = float(max(0.0, min(1.0, scores[1])))
    valence   = float(max(0.0, min(1.0, scores[2])))
    
    return {
        "arousal": round(arousal, 4),
        "dominance": round(dominance, 4),
        "valence": round(valence, 4),
    }
```

### Output

```json
{
  "arousal": 0.8712,
  "dominance": 0.6394,
  "valence": 0.2103
}
```

### Mock output (when `MOCK_ML=1`)

```python
def analyze_emotion_mock(waveform, sr=16000, device="auto") -> dict:
    return {"arousal": 0.65, "dominance": 0.50, "valence": 0.40}
```

### Edge cases

| Case | Handling |
|------|----------|
| Very short audio (<0.4s) | Model may produce unreliable results; let fusion handle via word_count check |
| Model outputs outside [0,1] | Clamp with `max(0, min(1, x))` |
| GPU OOM | Catch `RuntimeError`, fall back to CPU |

### Dependencies

```
torch
transformers
numpy
```

---

## Service 3: Prosody Service (`prosody_service.py`) — Lane A

### Purpose
Compute speech prosody features from Whisper's word timestamps and the raw waveform. These features power our fatigue detection.

### Input

```python
def compute_prosody(
    waveform: np.ndarray,
    sr: int,
    words: list[dict],          # [{"word": str, "start": float, "end": float}]
    emotion_output: dict,        # {"arousal": float, "dominance": float, "valence": float}
) -> dict:
    """
    Returns:
        ProsodyFeatures dict matching CONTRACT.md §4.1
    """
```

### Logic

```python
import numpy as np

def compute_prosody(waveform, sr, words, emotion_output):
    duration_s = len(waveform) / sr
    word_count = len(words)
    
    # --- Speech rate ---
    if word_count > 0:
        voiced_duration = sum(w["end"] - w["start"] for w in words)
        speech_rate_wps = word_count / voiced_duration if voiced_duration > 0 else None
    else:
        voiced_duration = 0
        speech_rate_wps = None
    
    # --- Pause ratio ---
    pause_ratio = 1.0 - (voiced_duration / duration_s) if duration_s > 0 else None
    if pause_ratio is not None:
        pause_ratio = max(0.0, min(1.0, pause_ratio))
    
    # --- Pause statistics ---
    if word_count >= 2:
        gaps = []
        for i in range(len(words) - 1):
            gap = words[i + 1]["start"] - words[i]["end"]
            if gap > 0:  # Only count positive gaps
                gaps.append(gap)
        mean_pause_s = float(np.mean(gaps)) if gaps else None
        longest_pause_s = float(max(gaps)) if gaps else None
    else:
        mean_pause_s = None
        longest_pause_s = None
    
    # --- RMS energy (loudness proxy, normalized 0–1) ---
    rms = float(np.sqrt(np.mean(waveform.astype(np.float64) ** 2)))
    # Normalize: 0.1 RMS ≈ "very loud" for compressed radio audio
    rms_energy = min(1.0, rms / 0.1)
    
    # --- Pitch (median F0) — optional ---
    pitch_hz = None
    try:
        import librosa
        f0, voiced_flag, _ = librosa.pyin(
            waveform.astype(np.float64), fmin=50, fmax=500, sr=sr
        )
        voiced_f0 = f0[voiced_flag] if voiced_flag is not None else f0[~np.isnan(f0)]
        if len(voiced_f0) > 0:
            pitch_hz = round(float(np.nanmedian(voiced_f0)), 1)
    except (ImportError, Exception):
        pitch_hz = None  # librosa not installed or pitch extraction failed
    
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

### Output

```json
{
  "arousal": 0.87,
  "dominance": 0.64,
  "valence": 0.21,
  "speech_rate_wps": 3.94,
  "pause_ratio": 0.08,
  "mean_pause_s": 0.11,
  "longest_pause_s": 0.34,
  "rms_energy": 0.71,
  "pitch_hz": 198.4,
  "duration_s": 4.32,
  "word_count": 5
}
```

### Dependencies

```
numpy
librosa  (optional — for pitch only)
```

---

## Service 4: Fusion Service (`fusion_service.py`) — Lane A

### Purpose
The orchestrator: loads audio, calls ASR, Emotion, and Prosody services, then applies mood fusion rules to produce the final `ClipAnalysis` payload (minus identity/context fields, which Lane B adds).

### Input

```python
def analyze_audio(wav_path: str, device: str = "auto") -> dict:
    """
    Full analysis pipeline for one audio clip.
    
    Args:
        wav_path: Path to audio file
        device: "auto" | "cuda" | "mps" | "cpu"
    
    Returns:
        dict with keys: transcript, words, asr_model, prosody, mood,
        processing_ms, mocked
    """
```

### Logic

```python
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
    if arousal > 0.65:   factors.append("high_arousal")
    if arousal < 0.35:   factors.append("low_arousal")
    if valence < 0.35:   factors.append("negative_valence")
    if valence > 0.65:   factors.append("positive_valence")
    if speech_rate and speech_rate > 3.5: factors.append("fast_speech")
    if speech_rate and speech_rate < 2.0: factors.append("slow_speech")
    if pause_ratio and pause_ratio > 0.4: factors.append("long_pauses")
    if rms_energy and rms_energy > 0.7:   factors.append("high_volume")
    
    # --- Rationale ---
    arousal_desc = "High" if arousal > 0.5 else "Low"
    valence_desc = "negative" if valence < 0.5 else "positive"
    rationale = f"{arousal_desc} arousal ({arousal:.2f}) with {valence_desc} valence ({valence:.2f})"
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
```

### Output

The dict returned by `analyze_audio()` matches `ClipAnalysis` minus these fields (which Lane B adds):
- `clip_id`, `source`, `driver`, `race`, `lap`, `session_type`
- `lap_context`
- `audio_url`
- `processed_at`

### Mock version

When `MOCK_ML=1`, Lane B should NOT import this module at all (it would trigger torch import). Instead, return canned data from `cache_service.get_mock_analysis()`.

### Dependencies

```
torch
transformers
numpy
soundfile
librosa  (optional, for resampling + pitch)
```

---

## Service 5: Cache Service (`cache_service.py`) — Lane B

### Purpose
Read and write the `data/cache/analyses.json` file. This is the central store of all precomputed clip analyses.

### Input / Output

```python
def load_cache() -> dict[str, dict]:
    """Load analyses.json → dict keyed by clip_id."""

def get_cache() -> dict[str, dict]:
    """Singleton getter — loads once, caches in memory."""

def add_to_cache(clip_id: str, analysis: dict) -> None:
    """Add a new analysis to the cache (for live uploads). Also writes to disk."""

def get_mock_analysis(clip_id: str) -> dict:
    """Return a canned mock analysis for testing. Used when MOCK_ML=1."""
```

### Logic

```python
import json
from pathlib import Path
from app.config import settings

_cache: dict[str, dict] | None = None


def load_cache() -> dict[str, dict]:
    """Load the analyses.json file into memory."""
    cache_path = Path(settings.CACHE_FILE)
    if not cache_path.exists():
        return {}
    with open(cache_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # data is a list of ClipAnalysis dicts
    return {item["clip_id"]: item for item in data}


def get_cache() -> dict[str, dict]:
    """Singleton: load once, return cached dict."""
    global _cache
    if _cache is None:
        _cache = load_cache()
    return _cache


def add_to_cache(clip_id: str, analysis: dict) -> None:
    """Add a new analysis (e.g., from a live upload) and persist to disk."""
    cache = get_cache()
    cache[clip_id] = analysis
    _save_cache(cache)


def _save_cache(cache: dict[str, dict]) -> None:
    """Write the cache back to analyses.json."""
    cache_path = Path(settings.CACHE_FILE)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    data = list(cache.values())
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


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
            "arousal": 0.65, "dominance": 0.50, "valence": 0.40,
            "speech_rate_wps": 2.50, "pause_ratio": 0.20,
            "mean_pause_s": 0.15, "longest_pause_s": 0.15,
            "rms_energy": 0.45, "pitch_hz": 180.0,
            "duration_s": 2.00, "word_count": 5,
        },
        "mood": {
            "label": "CALM", "confidence": 0.61,
            "stress_index": 0.39, "fatigue_index": 0.00,
            "quadrant": "HIGH_AROUSAL_NEGATIVE",
            "rationale": "High arousal (0.65) with negative valence (0.40) indicates mild tension.",
            "contributing_factors": [],
        },
        "processing_ms": 50,
        "mocked": True,
    }
```

### The `analyses.json` format

```json
[
  { "clip_id": "ham_silverstone_2021_l52", ... full ClipAnalysis ... },
  { "clip_id": "rai_abu_dhabi_2018_l53", ... },
  ...
]
```

It's a **JSON array** of `ClipAnalysis` objects. The cache service loads it into a dict keyed by `clip_id` for O(1) lookup.

---

## Service 6: Lap Service (`lap_service.py`) — Lane B

### Purpose
Read precomputed FastF1 lap data and build `LapSeries` and `LapContext` objects.

### Input / Output

```python
def get_lap_series(driver: str, race: str) -> dict | None:
    """
    Returns a LapSeries dict for the given driver+race, or None if no data exists.
    Reads from data/laps/{driver_lower}_{race_slug}.json
    """

def get_lap_context(driver: str, race: str, lap: int) -> dict | None:
    """
    Returns a LapContext dict for a specific lap, or None.
    Includes ±5 laps window, baseline, deltas, trend.
    """
```

### Logic

```python
import json
from pathlib import Path
from app.config import settings
from app.services.cache_service import get_cache


def _make_filename(driver: str, race: str) -> str:
    """Convert 'HAM', 'Silverstone 2021' → 'ham_silverstone_2021.json'"""
    slug = race.lower().replace(" ", "_")
    return f"{driver.lower()}_{slug}.json"


def _load_laps_file(driver: str, race: str) -> dict | None:
    """Load a single lap JSON file."""
    filename = _make_filename(driver, race)
    path = Path(settings.LAPS_DIR) / filename
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _mark_radio_laps(laps: list[dict], driver: str, race: str) -> list[dict]:
    """Set is_radio_lap=True for laps that have a radio clip in our dataset."""
    cache = get_cache()
    radio_laps = set()
    for clip_id, analysis in cache.items():
        if analysis.get("driver") == driver and analysis.get("race") == race:
            if analysis.get("lap") is not None:
                radio_laps.add(analysis["lap"])
    
    for lap in laps:
        lap["is_radio_lap"] = lap["lap_number"] in radio_laps
    return laps


def get_lap_series(driver: str, race: str) -> dict | None:
    """Build a full LapSeries for the given driver+race."""
    data = _load_laps_file(driver, race)
    if data is None:
        return None
    
    laps = data.get("laps", [])
    laps = _mark_radio_laps(laps, driver, race)
    
    return {
        "driver": driver,
        "race": race,
        "baseline_s": data.get("baseline_s"),
        "total_laps": len(laps),
        "laps": laps,
    }


def get_lap_context(driver: str, race: str, lap: int) -> dict | None:
    """Build LapContext for a specific lap (used by POST /api/analyze)."""
    series = get_lap_series(driver, race)
    if series is None:
        return None
    
    laps = series["laps"]
    baseline_s = series.get("baseline_s")
    
    # Find the target lap
    target = None
    target_idx = None
    for i, lp in enumerate(laps):
        if lp["lap_number"] == lap:
            target = lp
            target_idx = i
            break
    
    if target is None:
        return None
    
    # Compute deltas
    lap_time_s = target.get("lap_time_s")
    delta_s = (lap_time_s - baseline_s) if (lap_time_s and baseline_s) else None
    
    prev_delta = None
    next_delta = None
    if target_idx > 0:
        prev_time = laps[target_idx - 1].get("lap_time_s")
        prev_delta = (prev_time - baseline_s) if (prev_time and baseline_s) else None
    if target_idx < len(laps) - 1:
        next_time = laps[target_idx + 1].get("lap_time_s")
        next_delta = (next_time - baseline_s) if (next_time and baseline_s) else None
    
    # Determine trend
    if delta_s is not None and next_delta is not None:
        if next_delta > delta_s + 0.3:
            trend = "DEGRADING"
        elif next_delta < delta_s - 0.3:
            trend = "IMPROVING"
        else:
            trend = "STABLE"
    else:
        trend = "STABLE"
    
    # Build ±5 lap window
    start = max(0, target_idx - 5)
    end = min(len(laps), target_idx + 6)
    window = laps[start:end]
    
    return {
        "lap_number": lap,
        "lap_time_s": lap_time_s,
        "baseline_s": baseline_s,
        "delta_s": round(delta_s, 3) if delta_s is not None else None,
        "next_lap_delta_s": round(next_delta, 3) if next_delta is not None else None,
        "prev_lap_delta_s": round(prev_delta, 3) if prev_delta is not None else None,
        "compound": target.get("compound"),
        "trend": trend,
        "window": window,
    }
```

### The lap JSON file format

Each file in `data/laps/` is a JSON file produced by `scripts/fetch_laps.py`:

```json
{
  "driver": "HAM",
  "race": "Silverstone 2021",
  "session_key": "2021_7_R",
  "baseline_s": 89.412,
  "laps": [
    {
      "lap_number": 1,
      "lap_time_s": 94.123,
      "delta_s": 4.711,
      "compound": "MEDIUM",
      "stint": 1,
      "tyre_life": 1,
      "is_pit_lap": false,
      "is_accurate": true,
      "track_status": "1",
      "is_radio_lap": false
    }
  ]
}
```

---

## Service 7: Correlation Service (`correlation_service.py`) — Lane B

### Purpose
Compute aggregate statistics across all clips that have both a stress index and a lap-time delta.

### Input / Output

```python
def compute_correlation() -> dict:
    """
    Returns a CorrelationSummary dict.
    Uses data from cache_service.get_cache().
    """
```

### Logic

```python
import numpy as np
from scipy.stats import pearsonr
from app.services.cache_service import get_cache


def compute_correlation() -> dict:
    cache = get_cache()
    
    points = []
    for clip_id, analysis in cache.items():
        mood = analysis.get("mood", {})
        stress = mood.get("stress_index")
        lap_ctx = analysis.get("lap_context")
        delta = lap_ctx.get("delta_s") if lap_ctx else None
        
        if stress is not None and delta is not None:
            points.append({
                "clip_id": clip_id,
                "driver": analysis.get("driver"),
                "stress_index": stress,
                "delta_s": delta,
                "mood_label": mood.get("label", "UNKNOWN"),
            })
    
    n = len(points)
    
    if n < 3:
        return {
            "n": n,
            "pearson_r": None,
            "p_value": None,
            "pearson_r_next_lap": None,
            "mean_delta_by_mood": {},
            "points": points,
            "headline": f"Only {n} clips have both stress and lap data. Need at least 3 for correlation.",
        }
    
    stresses = np.array([p["stress_index"] for p in points])
    deltas = np.array([p["delta_s"] for p in points])
    
    r, p = pearsonr(stresses, deltas)
    r = round(float(r), 3)
    p = round(float(p), 4)
    
    # Next-lap correlation
    r_next = None
    next_points = []
    for clip_id, analysis in cache.items():
        mood = analysis.get("mood", {})
        stress = mood.get("stress_index")
        lap_ctx = analysis.get("lap_context")
        next_delta = lap_ctx.get("next_lap_delta_s") if lap_ctx else None
        if stress is not None and next_delta is not None:
            next_points.append((stress, next_delta))
    
    if len(next_points) >= 3:
        s_arr = np.array([x[0] for x in next_points])
        d_arr = np.array([x[1] for x in next_points])
        r_next, _ = pearsonr(s_arr, d_arr)
        r_next = round(float(r_next), 3)
    
    # Mean delta by mood
    by_mood: dict[str, list[float]] = {}
    for p_item in points:
        label = p_item["mood_label"]
        by_mood.setdefault(label, []).append(p_item["delta_s"])
    mean_delta_by_mood = {k: round(float(np.mean(v)), 3) for k, v in by_mood.items()}
    
    # Headline
    p_str = f"p = {p:.4f}" if p >= 0.001 else "p < 0.001"
    stressed_delta = mean_delta_by_mood.get("STRESSED", 0)
    headline = (
        f"Across {n} radio messages, stress index correlates with lap-time loss "
        f"at r = {r:.2f} ({p_str}). "
        f"Messages flagged STRESSED averaged {'+' if stressed_delta > 0 else ''}{stressed_delta:.2f}s "
        f"versus the driver's clean-lap baseline."
    )
    
    return {
        "n": n,
        "pearson_r": r,
        "p_value": p,
        "pearson_r_next_lap": r_next,
        "mean_delta_by_mood": mean_delta_by_mood,
        "points": points,
        "headline": headline,
    }
```

### Dependencies

```
numpy
scipy
```

---

## Service Dependency Graph

```
fusion_service.py
    ├── asr_service.py          (calls transcribe)
    ├── emotion_service.py      (calls analyze_emotion)
    └── prosody_service.py      (calls compute_prosody)

Routes (all in routes/)
    ├── analyze.py → fusion_service.py (when MOCK_ML=0)
    │            → cache_service.py (when MOCK_ML=1, and always for caching)
    ├── clips.py → cache_service.py
    ├── laps.py → lap_service.py
    ├── correlation.py → correlation_service.py → cache_service.py
    ├── audio.py → (reads files directly)
    ├── health.py → cache_service.py
    └── eval_route.py → cache_service.py
```

### Import rule

**Lane B's routes should NEVER import Lane A's services at the top of the file.** Always use conditional imports inside functions:

```python
# CORRECT (in routes/analyze.py)
if settings.MOCK_ML:
    from app.services.cache_service import get_mock_analysis
    result = get_mock_analysis(clip_id)
else:
    from app.services.fusion_service import analyze_audio  # <-- only imported when needed
    result = analyze_audio(str(wav_path), device=settings.DEVICE)

# WRONG — this would crash when MOCK_ML=1 because torch isn't installed
from app.services.fusion_service import analyze_audio  # top-level import
```

This is critical: Lane B's routes must boot in <2 seconds with `MOCK_ML=1`, which means no torch import at module level.
