# AGENTS.md — The Silent Co-Driver Project Bible

> **This document tells you everything about the project.** If you are a
> teammate or an AI coding agent, read this before writing a single line of code.
> After reading this, read [CONTRACT.md](CONTRACT.md) for all data shapes.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Hackathon Rules That Shape Our Design](#2-hackathon-rules-that-shape-our-design)
3. [Architecture](#3-architecture)
4. [Models We Use (and Why)](#4-models-we-use-and-why)
5. [Team Structure — 3 Lanes](#5-team-structure--3-lanes)
6. [Folder Structure](#6-folder-structure)
7. [The Analysis Pipeline (What Happens When Audio Is Analyzed)](#7-the-analysis-pipeline)
8. [The Mood Fusion Logic (Our Differentiator)](#8-the-mood-fusion-logic)
9. [The Fatigue Detection (Our Second Differentiator)](#9-the-fatigue-detection)
10. [Lap-Time Correlation (The Money Slide)](#10-lap-time-correlation)
11. [Frontend Component Map](#11-frontend-component-map)
12. [Mock Mode — How Parallel Work Is Possible](#12-mock-mode)
13. [Deployment Plan](#13-deployment-plan)
14. [Key Technical Gotchas](#14-key-technical-gotchas)
15. [Glossary](#15-glossary)

---

## 1. Project Overview

**Name**: Silent Co-Driver
**Hackathon**: AI Race GrandPrix (Mphasis × HuggingFace)
**Problem Statement**: PS1 — "The Silent Co-Driver"
**One-liner**: Detect driver stress, fatigue, and emotional state from F1 team radio audio, and correlate it with on-track performance.

### What it does, step by step

1. **Input**: An F1 team radio audio clip (e.g., "Bono, my tyres are gone!")
2. **ASR**: Whisper transcribes the audio and provides word-level timestamps
3. **Emotion Detection**: audeering wav2vec2 model produces arousal, valence, dominance scores (0–1)
4. **Prosody Features**: From Whisper's word timestamps, we compute speech rate (words/sec), pause ratio, mean pause duration, longest pause
5. **Raw Audio Features**: RMS energy (loudness proxy), median pitch (F0)
6. **Mood Fusion**: A rule-based system maps (arousal, valence, speech features) → STRESSED / CALM / TIRED / UNKNOWN using Russell's circumplex model
7. **Lap Context**: If we know the driver, race, and lap number, FastF1 data tells us the lap time, tyre compound, and whether performance degraded
8. **Correlation**: Across all clips, we compute Pearson correlation between stress index and lap-time delta — this is our headline finding
9. **Frontend**: Shows audio player, waveform, transcript with word timings, mood card with contributing factors, and an interactive lap chart with stress markers overlaid

### Why we win

Most PS1 teams will:
- Use Whisper + a RAVDESS emotion classifier (discrete classes: angry/happy/sad)
- Show a label and stop

We do three things differently:
1. **Dimensional emotion** (arousal/valence/dominance) instead of discrete classes — grounded in Russell's circumplex, a published psychological model
2. **Derived fatigue detection** — "Tired" is in no SER model's label set, we compute it from speech rate + pause patterns + low arousal
3. **Stress → performance correlation** — we don't just detect stress, we show it predicts lap-time loss with a Pearson r statistic

---

## 2. Hackathon Rules That Shape Our Design

| Rule | What it means for us |
|------|---------------------|
| Must have frontend AND backend, connected | Next.js + FastAPI with real HTTP calls |
| "Not solvable by calling one ready-made tool" | Our fusion logic, fatigue derivation, and prosody features are custom work |
| Must use HuggingFace Hub | Whisper + audeering model, both from HF. Deploy backend as HF Docker Space |
| Judging rewards execution > novelty | Polish the demo, don't add features |
| Every team member needs an HF account | Do this NOW if you haven't |

### Submission requirements (Aug 14, 23:59)

- GitHub link (public repo)
- PPT link (optional but do it)
- Demo video link (optional but do it)
- Problem Statement: 1

### Deadlines

| Date | What |
|------|------|
| Aug 14, 23:59 | Google Form submission (GitHub, PPT, demo video links) |
| Aug 15 | Deployment live, enhancement allowed |
| Aug 22 | Stage 2 — Grand Prix Finals (Paytm Noida, live demo + pitch) |
| Sep 12 | Grand Finale (Plaksha, ₹1.75L pool) |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌────────────────────┐ │
│  │ Sidebar  │ │ Audio     │ │ Mood     │ │ Lap Chart          │ │
│  │ (clip    │ │ Player +  │ │ Card +   │ │ (Recharts) with    │ │
│  │  list)   │ │ Waveform  │ │ Factors  │ │ stress markers     │ │
│  └──────────┘ └───────────┘ └──────────┘ └────────────────────┘ │
│  ┌──────────────────────────┐ ┌──────────────────────────────┐  │
│  │ Transcript with word     │ │ Correlation scatter plot     │  │
│  │ timings (highlighted)    │ │ (stress vs lap delta)        │  │
│  └──────────────────────────┘ └──────────────────────────────┘  │
│  ┌──────────────────────────┐ ┌──────────────────────────────┐  │
│  │ Upload panel (drag/drop) │ │ Arousal/Valence gauge        │  │
│  └──────────────────────────┘ └──────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP (JSON)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI)                         │
│                                                                   │
│  Routes:                                                          │
│  GET  /api/health          → HealthStatus                         │
│  GET  /api/clips           → ClipSummary[]                        │
│  GET  /api/clips/{id}      → ClipAnalysis                         │
│  POST /api/analyze         → ClipAnalysis  (multipart audio)      │
│  GET  /api/laps            → LapSeries                            │
│  GET  /api/correlation     → CorrelationSummary                   │
│  GET  /api/audio/{id}      → audio/wav bytes                      │
│  GET  /api/eval            → EvalSummary                          │
│                                                                   │
│  Services:                                                        │
│  ┌────────────┐ ┌────────────────┐ ┌─────────────┐               │
│  │ ASR        │ │ Emotion        │ │ Prosody     │               │
│  │ Service    │ │ Service        │ │ Service     │               │
│  │ (Whisper)  │ │ (audeering)    │ │ (custom)    │               │
│  └─────┬──────┘ └───────┬────────┘ └──────┬──────┘               │
│        └────────────┬───┘                  │                      │
│                     ▼                      │                      │
│              ┌──────────────┐              │                      │
│              │ Fusion       │◄─────────────┘                      │
│              │ Service      │                                     │
│              │ (mood rules) │                                     │
│              └──────────────┘                                     │
│  ┌────────────┐ ┌────────────────┐ ┌─────────────┐               │
│  │ Lap        │ │ Correlation    │ │ Cache       │               │
│  │ Service    │ │ Service        │ │ Service     │               │
│  │ (FastF1)   │ │ (stats)        │ │ (JSON file) │               │
│  └────────────┘ └────────────────┘ └─────────────┘               │
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                │
│  data/clips/*.wav         — 25-30 F1 radio clips, 16kHz mono     │
│  data/metadata.csv        — clip → driver/race/lap mapping       │
│  data/labels.csv          — hand labels for eval (optional)      │
│  data/laps/*.json         — FastF1 lap-time dumps                │
│  data/cache/analyses.json — precomputed model output             │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Models We Use (and Why)

### 4.1 ASR: `openai/whisper-small`

- **Why this one**: Supports `return_timestamps="word"` which gives us per-word start/end times. This is essential for computing speech rate and pause ratio (our fatigue features). `distil-whisper/distil-small.en` does NOT support word timestamps.
- **Input**: Audio file (any format, resampled to 16kHz internally)
- **Output**: Transcript string + list of `{word, start, end}` objects
- **Size**: ~461 MB download
- **Speed**: ~2-4s per clip on RTX 5070 Ti, ~8-15s on CPU
- **HF link**: https://huggingface.co/openai/whisper-small
- **License**: MIT

### 4.2 Emotion: `audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim`

- **Why this one**: Outputs **continuous dimensional emotion** (arousal, dominance, valence) on a 0–1 scale, instead of discrete acted-emotion classes like RAVDESS models. This maps directly onto Russell's circumplex model, which is our theoretical backing.
- **Input**: 16 kHz mono float32 waveform, shape `(1, num_samples)`
- **Output**: `model(input)[1]` → tensor of `[arousal, dominance, valence]`, each ~0–1
- **⚠️ CRITICAL GOTCHA**: This model has **NO AutoModel support**. You must define two custom PyTorch classes (`RegressionHead` and `EmotionModel`) yourself. The exact code is in [IMPLEMENTATION.md](IMPLEMENTATION.md) §2.2. **Do not skip this — there is no pip-installable wrapper.**
- **Size**: ~1.3 GB download
- **Speed**: ~1-2s per clip on GPU, ~3-5s on CPU
- **HF link**: https://huggingface.co/audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim
- **License**: CC-BY-NC-SA-4.0 (research/non-commercial only — fine for hackathon, mention in README)

### 4.3 FastF1 (not a model, but critical)

- **What**: Python library that downloads and caches F1 timing data from the official live-timing API
- **Provides**: Lap times, sector times, tyre compound, stint number, tyre life, pit stops, track status, weather — for any session since 2018
- **Usage**: Run ONCE locally via `scripts/fetch_laps.py`, dump to `data/laps/*.json`, commit the JSON. **Never call FastF1 at runtime** — the first call downloads ~50-100 MB and takes 30-60 seconds.
- **Key columns from `session.laps`**: `LapNumber` (float→int!), `LapTime` (Timedelta→float seconds!), `Compound`, `Stint`, `TyreLife`, `IsAccurate`, `TrackStatus`
- **Install**: `pip install fastf1`

### 4.4 Optional: Text Sentiment (P2, skip for MVP)

- **Model**: `cardiffnlp/twitter-roberta-base-sentiment-latest`
- **Purpose**: Run on the transcript to get text-level sentiment as a secondary signal
- **Status**: **DO NOT implement in v1.** Only add if genuinely ahead of schedule. Lane A can add it as a bonus after core pipeline works.

---

## 5. Team Structure — 3 Lanes

### The principle

Every lane works in **completely separate files**. No two lanes ever edit the same file. The only shared contract is [CONTRACT.md](CONTRACT.md) — the JSON shapes and API endpoints. As long as everyone obeys the contract, code will merge cleanly.

### Lane A — ML/Audio Pipeline

**What you build**: The core ML inference pipeline — the functions that take raw audio and produce analysis results.

**Files you own** (nobody else touches these):

```
backend/app/services/asr_service.py        ← Whisper transcription
backend/app/services/emotion_service.py    ← audeering wav2vec2 emotion
backend/app/services/prosody_service.py    ← speech rate, pauses, pitch, energy
backend/app/services/fusion_service.py     ← mood label derivation from all signals
```

**What you deliver**: A single function that Lane B calls:

```python
# This is the interface Lane B depends on. It lives in fusion_service.py.
def analyze_audio(wav_path: str, device: str = "auto") -> dict:
    """
    Full analysis pipeline for one audio clip.
    
    Args:
        wav_path: Path to a .wav file (16kHz mono preferred, will resample if not)
        device: "auto" | "cuda" | "mps" | "cpu"
    
    Returns:
        dict matching the ClipAnalysis schema minus the identity/context/url fields.
        Specifically:
        {
            "transcript": str,
            "words": [{"word": str, "start": float, "end": float}, ...],
            "asr_model": str,
            "prosody": {ProsodyFeatures dict},
            "mood": {MoodVerdict dict},
            "processing_ms": int,
            "mocked": False
        }
    """
```

**Hardware requirement**: GPU recommended (RTX 5070 Ti or Colab). Works on CPU but slow.

**Dependencies you need**: `torch`, `transformers`, `numpy`, `librosa` (optional, for pitch), `soundfile`

---

### Lane B — Backend + Data

**What you build**: The FastAPI application shell, all API routes, the data layer (cache, laps, metadata), data collection scripts, and contract tests.

**Files you own** (nobody else touches these):

```
backend/app/__init__.py
backend/app/main.py                        ← FastAPI app, CORS, lifespan
backend/app/config.py                      ← Settings from .env
backend/app/schemas.py                     ← All Pydantic models (from CONTRACT.md)
backend/app/routes/__init__.py
backend/app/routes/health.py
backend/app/routes/clips.py
backend/app/routes/analyze.py
backend/app/routes/laps.py
backend/app/routes/correlation.py
backend/app/routes/audio.py
backend/app/routes/eval_route.py
backend/app/services/__init__.py
backend/app/services/cache_service.py      ← Read/write analyses.json
backend/app/services/lap_service.py        ← Read lap JSONs, compute context
backend/app/services/correlation_service.py ← Pearson r, headline
backend/requirements.txt
backend/Dockerfile                         ← For HF Space deployment
backend/tests/__init__.py
backend/tests/test_contract.py             ← Schema validation tests
scripts/fetch_laps.py                      ← FastF1 → JSON dump
scripts/precompute.py                      ← Run all clips through pipeline
data/metadata.csv
data/labels.csv
data/cache/analyses.json                   ← 5-clip mock, then real precomputed
data/laps/                                 ← FastF1 JSON dumps
data/clips/                                ← WAV files (collected by team)
```

**Key responsibility**: When `MOCK_ML=1` (your default during development), the routes work perfectly using canned mock data. You never need to install torch or download models. When `MOCK_ML=0`, the routes call Lane A's `analyze_audio()` function for real inference.

**Dependencies you need**: `fastapi`, `uvicorn`, `pydantic`, `python-multipart`, `scipy` (for Pearson r), `pandas` (for FastF1 data cleaning), `fastf1` (for scripts only)

---

### Lane C — Frontend

**What you build**: The entire Next.js application — all pages, components, styling, and data fetching.

**Files you own** (nobody else touches these):

```
frontend/                                  ← ENTIRE directory
├── src/
│   ├── app/                               ← Next.js App Router pages
│   │   ├── layout.tsx
│   │   ├── page.tsx                       ← Main dashboard
│   │   └── globals.css
│   ├── components/
│   │   ├── Sidebar.tsx                    ← Clip list with search/filter
│   │   ├── AudioPlayer.tsx                ← WaveSurfer.js waveform + controls
│   │   ├── TranscriptView.tsx             ← Word-by-word with timing highlights
│   │   ├── MoodCard.tsx                   ← Big label + confidence + factors
│   │   ├── ArousalValenceGauge.tsx        ← Russell's circumplex visualization
│   │   ├── LapChart.tsx                   ← Recharts line chart with markers
│   │   ├── CorrelationPlot.tsx            ← Scatter plot (stress vs delta)
│   │   ├── UploadPanel.tsx                ← Drag-and-drop audio upload
│   │   ├── DevBanner.tsx                  ← Mock mode warning banner
│   │   └── LoadingStates.tsx              ← Skeletons and spinners
│   ├── lib/
│   │   ├── types.ts                       ← TypeScript types (from CONTRACT.md)
│   │   ├── mock.ts                        ← 5-clip mock data fixture
│   │   └── api.ts                         ← Fetch wrapper (mock vs real)
│   └── hooks/
│       ├── useClips.ts                    ← SWR/fetch for clip list
│       └── useClipAnalysis.ts             ← SWR/fetch for single clip
├── public/
├── package.json
├── tsconfig.json
├── next.config.mjs
└── tailwind.config.ts (if using Tailwind) or just globals.css
```

**Key responsibility**: When `NEXT_PUBLIC_USE_MOCKS=1` (your default during development), the app renders entirely from `src/lib/mock.ts`. You never need a running backend. When switched to `0`, it fetches from the real FastAPI backend.

**Dependencies you need**: `next`, `react`, `react-dom`, `recharts`, `wavesurfer.js`

---

### How the lanes connect

```
Lane C (Frontend)                 Lane B (Backend)                Lane A (ML)
    │                                  │                               │
    │   HTTP GET/POST                  │                               │
    ├─────────────────────────────────►│                               │
    │                                  │   from services.fusion_service│
    │                                  │   import analyze_audio        │
    │                                  ├──────────────────────────────►│
    │                                  │                               │
    │                                  │◄──────────────────────────────┤
    │                                  │   returns dict                │
    │◄─────────────────────────────────┤                               │
    │   returns JSON                   │                               │
```

**Integration order** (Aug 14 evening):
1. Lane A pushes to `main` (or their branch gets merged first)
2. Lane B pulls, flips `MOCK_ML=0`, tests that routes work with real ML
3. Lane B pushes
4. Lane C pulls, flips `NEXT_PUBLIC_USE_MOCKS=0`, points to running backend
5. End-to-end test

---

## 6. Folder Structure

```
AI_Race_GrandPrix/
├── CLAUDE.md                              ← Project context for AI agents
├── README.md                              ← Public-facing project description
├── .gitignore                             ← ✅ EXISTS
├── docker-compose.yml                     ← Optional, for local full-stack run
│
├── docs/                                  ← Planning documents
│   ├── AGENTS.md                          ← THIS FILE (project bible)
│   ├── CONTRACT.md                        ← ✅ EXISTS (frozen data contract)
│   ├── ROUTES.md                          ← API endpoint specifications
│   ├── SERVICES.md                        ← Backend service specifications
│   ├── IMPLEMENTATION.md                  ← Step-by-step build guide
│   ├── ROADMAP.md                         ← Timeline and lane assignments
│   ├── SETUP.md                           ← Environment setup guide
│   ├── GIT_WORKFLOW.md                    ← Branch strategy
│   └── DATASET.md                         ← Data collection guide
│
├── backend/                               ← Python FastAPI backend
│   ├── .env.example                       ← ✅ EXISTS
│   ├── .env                               ← NOT committed (copy from .example)
│   ├── requirements.txt
│   ├── Dockerfile                         ← For HF Space deployment
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                        ← FastAPI app entry point
│   │   ├── config.py                      ← Settings (reads .env)
│   │   ├── schemas.py                     ← Pydantic models
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── health.py
│   │   │   ├── clips.py
│   │   │   ├── analyze.py
│   │   │   ├── laps.py
│   │   │   ├── correlation.py
│   │   │   ├── audio.py
│   │   │   └── eval_route.py
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── asr_service.py             ← Lane A
│   │       ├── emotion_service.py         ← Lane A
│   │       ├── prosody_service.py         ← Lane A
│   │       ├── fusion_service.py          ← Lane A
│   │       ├── cache_service.py           ← Lane B
│   │       ├── lap_service.py             ← Lane B
│   │       └── correlation_service.py     ← Lane B
│   └── tests/
│       ├── __init__.py
│       └── test_contract.py
│
├── frontend/                              ← Next.js frontend (Lane C)
│   ├── .env.local.example                 ← ✅ EXISTS
│   ├── .env.local                         ← NOT committed
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.mjs
│   ├── public/
│   └── src/
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── globals.css
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   ├── AudioPlayer.tsx
│       │   ├── TranscriptView.tsx
│       │   ├── MoodCard.tsx
│       │   ├── ArousalValenceGauge.tsx
│       │   ├── LapChart.tsx
│       │   ├── CorrelationPlot.tsx
│       │   ├── UploadPanel.tsx
│       │   ├── DevBanner.tsx
│       │   └── LoadingStates.tsx
│       ├── lib/
│       │   ├── types.ts
│       │   ├── mock.ts
│       │   └── api.ts
│       └── hooks/
│           ├── useClips.ts
│           └── useClipAnalysis.ts
│
├── scripts/                               ← One-time data preparation
│   ├── fetch_laps.py                      ← FastF1 → data/laps/*.json
│   └── precompute.py                      ← Run all clips → analyses.json
│
└── data/                                  ← Committed dataset
    ├── metadata.csv                       ← clip_id,driver,race,lap,session_type,source_url,notes
    ├── labels.csv                         ← clip_id,human_mood,human_stress_1to5,labeler
    ├── clips/                             ← 16kHz mono WAV files (~10 MB total)
    │   ├── ham_silverstone_2021_l52.wav
    │   ├── rai_abu_dhabi_2018_l53.wav
    │   └── ...
    ├── laps/                              ← FastF1 dumps (one JSON per driver+race)
    │   ├── ham_silverstone_2021.json
    │   └── ...
    └── cache/
        └── analyses.json                  ← Precomputed model output for all clips
```

---

## 7. The Analysis Pipeline

When `POST /api/analyze` is called with an audio file, or when `scripts/precompute.py` processes a clip, this is exactly what happens:

### Step 1: Audio Loading & Preprocessing

```python
# Load audio, resample to 16kHz mono
import soundfile as sf
import numpy as np

waveform, sr = sf.read(wav_path)
if len(waveform.shape) > 1:
    waveform = waveform.mean(axis=1)  # stereo → mono
if sr != 16000:
    # Resample using librosa or scipy
    import librosa
    waveform = librosa.resample(waveform, orig_sr=sr, target_sr=16000)
    sr = 16000
```

### Step 2: ASR with Whisper (→ transcript + word timings)

```python
from transformers import WhisperProcessor, WhisperForConditionalGeneration

processor = WhisperProcessor.from_pretrained("openai/whisper-small")
model = WhisperForConditionalGeneration.from_pretrained("openai/whisper-small").to(device)

input_features = processor(waveform, sampling_rate=16000, return_tensors="pt").input_features.to(device)
predicted_ids = model.generate(input_features, return_timestamps=True)
result = processor.batch_decode(predicted_ids, skip_special_tokens=True, output_offsets=True)

# result[0]["text"] → "Bono, my tyres are gone!"
# result[0]["offsets"] → [{"token": "Bono,", "timestamp": (0.12, 0.58)}, ...]
```

**⚠️ Whisper word timestamp extraction is tricky.** See [IMPLEMENTATION.md](IMPLEMENTATION.md) §2.1 for the exact code that handles edge cases.

### Step 3: Emotion Detection (→ arousal, dominance, valence)

```python
# The audeering model requires CUSTOM model classes. See IMPLEMENTATION.md §2.2.
# After loading:
inputs = emotion_processor(waveform, sampling_rate=16000)
inputs = {k: v.to(device) for k, v in inputs.items()}
with torch.no_grad():
    outputs = emotion_model(inputs["input_values"])
# outputs[1] → tensor([arousal, dominance, valence]), each ~0–1
arousal, dominance, valence = outputs[1][0].cpu().numpy().tolist()
```

### Step 4: Prosody Features (→ speech rate, pauses, energy, pitch)

From the Whisper word timings:

```python
words = [...]  # list of {"word": str, "start": float, "end": float}
total_duration = waveform_length_in_seconds
voiced_duration = sum(w["end"] - w["start"] for w in words)
word_count = len(words)

speech_rate_wps = word_count / voiced_duration if voiced_duration > 0 else None
pause_ratio = 1.0 - (voiced_duration / total_duration) if total_duration > 0 else None

# Gaps between consecutive words
gaps = [words[i+1]["start"] - words[i]["end"] for i in range(len(words) - 1)]
mean_pause_s = np.mean(gaps) if gaps else None
longest_pause_s = max(gaps) if gaps else None

# RMS energy (loudness proxy, normalized 0–1)
rms = np.sqrt(np.mean(waveform ** 2))
rms_energy = min(rms / 0.1, 1.0)  # normalize: 0.1 RMS ≈ "very loud" for radio

# Pitch (median F0) — optional, requires librosa
try:
    import librosa
    f0, voiced_flag, _ = librosa.pyin(waveform, fmin=50, fmax=500, sr=16000)
    pitch_hz = float(np.nanmedian(f0[voiced_flag])) if any(voiced_flag) else None
except ImportError:
    pitch_hz = None
```

### Step 5: Mood Fusion (→ STRESSED / CALM / TIRED / UNKNOWN)

See [§8 below](#8-the-mood-fusion-logic) for the full rule table.

### Step 6: Assemble Output

All results are assembled into a `ClipAnalysis` dict matching [CONTRACT.md §4.4](CONTRACT.md#44-clipanalysis--the-main-payload).

---

## 8. The Mood Fusion Logic (Our Differentiator)

This is a **rule-based system**, not another model. It runs in ~0.1ms. The rules are grounded in Russell's circumplex model of affect.

### The two computed indices

```python
# Stress index: high arousal + negative valence = stressed
stress_index = arousal * (1.0 - valence)
# Clamp to [0, 1]
stress_index = max(0.0, min(1.0, stress_index))

# Fatigue index: low arousal + slow speech + long pauses
fatigue_signals = []
if arousal < 0.4:
    fatigue_signals.append(0.3)          # low arousal contributes
if speech_rate_wps is not None and speech_rate_wps < 2.5:
    fatigue_signals.append(0.3)          # slow speech
if pause_ratio is not None and pause_ratio > 0.4:
    fatigue_signals.append(0.2)          # lots of pauses
if mean_pause_s is not None and mean_pause_s > 0.5:
    fatigue_signals.append(0.2)          # long pauses

fatigue_index = min(1.0, sum(fatigue_signals))
```

### The label decision

```python
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
```

### The quadrant

```python
AROUSAL_MID = 0.5
VALENCE_MID = 0.5

if arousal >= AROUSAL_MID and valence < VALENCE_MID:
    quadrant = "HIGH_AROUSAL_NEGATIVE"       # angry, panicked → STRESSED
elif arousal >= AROUSAL_MID and valence >= VALENCE_MID:
    quadrant = "HIGH_AROUSAL_POSITIVE"       # elated, pumped → CALM (focused)
elif arousal < AROUSAL_MID and valence < VALENCE_MID:
    quadrant = "LOW_AROUSAL_NEGATIVE"        # dejected, drained → TIRED
else:
    quadrant = "LOW_AROUSAL_POSITIVE"        # relaxed, content → CALM
```

### Contributing factors (shown as chips in the UI)

```python
factors = []
if arousal > 0.65:     factors.append("high_arousal")
if arousal < 0.35:     factors.append("low_arousal")
if valence < 0.35:     factors.append("negative_valence")
if valence > 0.65:     factors.append("positive_valence")
if speech_rate_wps and speech_rate_wps > 3.5:   factors.append("fast_speech")
if speech_rate_wps and speech_rate_wps < 2.0:   factors.append("slow_speech")
if pause_ratio and pause_ratio > 0.4:           factors.append("long_pauses")
if rms_energy and rms_energy > 0.7:             factors.append("high_volume")
```

### The rationale (template, not AI-generated)

```python
rationale = f"{'High' if arousal > 0.5 else 'Low'} arousal ({arousal:.2f}) with " \
            f"{'negative' if valence < 0.5 else 'positive'} valence ({valence:.2f})"
if label == "STRESSED":
    rationale += " indicates acute stress."
elif label == "TIRED":
    rationale += f". Speech rate {speech_rate_wps:.1f} w/s suggests fatigue."
else:
    rationale += " indicates a calm state."
```

---

## 9. The Fatigue Detection (Our Second Differentiator)

**Why this matters**: "Tired" or "Fatigue" is in no speech emotion recognition model's label set. Every other team will only detect emotions like angry/happy/sad. We derive tiredness from **prosody signals** — this is genuinely novel and cheap to compute.

### The signals

| Signal | Source | Tired threshold | Normal baseline |
|--------|--------|----------------|-----------------|
| Arousal | audeering model | < 0.4 | 0.5–0.7 |
| Speech rate | Whisper word timestamps | < 2.5 w/s | 3.0–4.0 w/s |
| Pause ratio | Whisper word timestamps | > 0.4 | 0.1–0.25 |
| Mean pause | Whisper word timestamps | > 0.5s | 0.1–0.3s |
| Pitch decline | librosa F0 (optional) | Decreasing over clip | Stable or rising |

### Why it works

Fatigued speech is characterized by:
1. Lower vocal energy (low arousal)
2. Slower speech production (fewer words per second)
3. More and longer hesitation pauses
4. Lower pitch

These are well-documented in speech science literature. The key insight: while emotion models can't classify fatigue because it wasn't in their training data, we can compute these features directly from Whisper's word timestamps — no additional model needed.

---

## 10. Lap-Time Correlation (The Money Slide)

This is the analysis that turns "we made a mood detector" into "we found that stress predicts lap-time loss."

### How it works

1. For each clip that has `driver`, `race`, and `lap` metadata:
   - Look up the lap time from `data/laps/{driver}_{race}.json`
   - Compute `delta_s = lap_time - baseline` where baseline is the median of the driver's clean laps (accurate, non-pit, green-flag)
   - Record `(stress_index, delta_s)` as a data point

2. Across all such clips:
   - Compute Pearson correlation: `r = pearson(stress_indices, deltas)`
   - Compute p-value
   - Compute mean delta by mood label: `{"CALM": -0.04, "STRESSED": +0.83, "TIRED": +0.51}`

3. Generate a headline string:
   ```
   "Across 28 radio messages, stress index correlates with lap-time loss
    at r = 0.61 (p < 0.001). Messages flagged STRESSED averaged +0.83s
    versus the driver's clean-lap baseline."
   ```

### Why this is powerful

- A positive correlation (r > 0) means: when stress goes up, lap times get worse. This is the intuitive claim, and if our data supports it, it's a strong demo moment.
- Even r ≈ 0.3 is interesting and worth showing.
- We can also check `pearson_r_next_lap` — does stress predict FUTURE lap-time loss? That's a genuine predictive insight.

---

## 11. Frontend Component Map

### Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header: "Silent Co-Driver" + subtitle                                 │
├──────────────┬──────────────────────────────────────────────────────────┤
│              │  ┌──────────────────────────────────────────────────────┐│
│   Sidebar    │  │  Audio Player + Waveform                            ││
│   (clip      │  └──────────────────────────────────────────────────────┘│
│    list)     │  ┌──────────────────────┬───────────────────────────────┐│
│              │  │  Mood Card           │  Arousal/Valence Gauge       ││
│  - filter    │  │  - label (big)       │  - circumplex scatter        ││
│  - search    │  │  - confidence        │  - current point highlighted ││
│  - each item │  │  - stress/fatigue    │                               ││
│    shows:    │  │    indices            │                               ││
│    · driver  │  │  - contributing      │                               ││
│    · mood    │  │    factors (chips)   │                               ││
│    · delta   │  │  - rationale text    │                               ││
│    · preview │  └──────────────────────┴───────────────────────────────┘│
│              │  ┌──────────────────────────────────────────────────────┐│
│              │  │  Transcript View                                     ││
│              │  │  - word by word, highlighted on audio playback       ││
│              │  └──────────────────────────────────────────────────────┘│
│              │  ┌──────────────────────────────────────────────────────┐│
│              │  │  Lap Chart (Recharts)                                ││
│              │  │  - line chart: lap number vs delta_s                 ││
│              │  │  - markers on radio laps                             ││
│              │  │  - color by tyre compound                            ││
│              │  │  - tooltip: lap time, compound, stint                ││
│              │  └──────────────────────────────────────────────────────┘│
│              │  ┌──────────────────────────────────────────────────────┐│
│              │  │  Correlation Plot (scatter)                          ││
│              │  │  - x: stress_index, y: delta_s                      ││
│              │  │  - color by mood label                               ││
│              │  │  - headline text below                               ││
│              │  └──────────────────────────────────────────────────────┘│
│              │  ┌──────────────────────────────────────────────────────┐│
│              │  │  Upload Panel                                        ││
│              │  │  - drag and drop or file picker                      ││
│              │  │  - POST to /api/analyze, show result inline          ││
│              │  └──────────────────────────────────────────────────────┘│
└──────────────┴──────────────────────────────────────────────────────────┘
```

### Component responsibilities

| Component | Data source | Key visual element |
|-----------|-------------|-------------------|
| `Sidebar` | `GET /api/clips` → `ClipSummary[]` | Scrollable list with mood pill + delta badge |
| `AudioPlayer` | `audio_url` from `ClipAnalysis` | WaveSurfer.js waveform, play/pause, seek |
| `TranscriptView` | `words[]` from `ClipAnalysis` | Words highlighted in sync with playback |
| `MoodCard` | `mood` from `ClipAnalysis` | Big label, color-coded, confidence bar, factor chips |
| `ArousalValenceGauge` | `prosody.arousal`, `prosody.valence` | 2D scatter on circumplex axes |
| `LapChart` | `lap_context.window` from `ClipAnalysis` OR `GET /api/laps` | Recharts LineChart |
| `CorrelationPlot` | `GET /api/correlation` → `CorrelationSummary` | Recharts ScatterChart |
| `UploadPanel` | user file → `POST /api/analyze` → `ClipAnalysis` | File input, loading spinner, inline result |
| `DevBanner` | `NEXT_PUBLIC_SHOW_DEV_BANNER` env var | Bright warning if mocks are on |

---

## 12. Mock Mode

### Why it exists

Three people working independently need to build and test without waiting for each other. Mock mode makes this possible:

| Flag | Where | Effect |
|------|-------|--------|
| `MOCK_ML=1` | `backend/.env` | Backend routes work, but ML services return canned data. No torch, no models. Boots in <2s. |
| `NEXT_PUBLIC_USE_MOCKS=1` | `frontend/.env.local` | Frontend reads from `src/lib/mock.ts`. Zero network calls. |

### Who uses what

| Phase | Lane A (ML) | Lane B (Backend) | Lane C (Frontend) |
|-------|-------------|-------------------|-------------------|
| Solo work | `MOCK_ML=0` (real models) | `MOCK_ML=1` | `USE_MOCKS=1` |
| Integration | — | `MOCK_ML=0` | `USE_MOCKS=0` |
| Demo | `MOCK_ML=0` everywhere | | `USE_MOCKS=0` |

### Mock data requirements

The mock fixture (`data/cache/analyses.json` and `frontend/src/lib/mock.ts`) must contain at least **5 clips** covering every UI state:

| # | Clip | Mood | Purpose |
|---|------|------|---------|
| 1 | `ham_silverstone_2021_l52` | STRESSED | Hero case: high stress, big positive delta |
| 2 | `rai_abu_dhabi_2018_l53` | CALM | Proves UI handles calm state |
| 3 | `vet_germany_2018_l52` | TIRED | Tests fatigue label + chips |
| 4 | `upload_mock_001` | UNKNOWN | No metadata, null lap_context — tests the upload path |
| 5 | `ham_hungary_2021_l45` | STRESSED | Long transcript (~40 words), null pitch_hz — tests overflow |

---

## 13. Deployment Plan

### Frontend → Vercel

1. Connect GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Set environment variables:
   - `NEXT_PUBLIC_API_BASE` = HF Space URL
   - `NEXT_PUBLIC_USE_MOCKS` = `0`
   - `NEXT_PUBLIC_SHOW_DEV_BANNER` = `0`
4. Deploy (auto-builds on push to `main`)

### Backend → HuggingFace Docker Space

1. Create a new HF Space (Docker type)
2. Upload the `backend/Dockerfile` + code
3. The Space builds and runs FastAPI on port 7860
4. Set Space secrets (environment variables):
   - `MOCK_ML=0`
   - `CORS_ORIGINS=https://your-app.vercel.app`
5. URL will be: `https://<username>-silent-codriver.hf.space`

### Why HF Space for backend

- **Visible HF usage**: The submission requirement is to use HuggingFace. A HF Space makes this immediately obvious to judges.
- **Free tier**: 2 vCPU, 16 GB RAM. Enough for cached demos. Real-time Whisper will be slow (~15-20s) but works.
- **Models download on first request**: The Space cold-starts with no models. First `/api/analyze` triggers downloads (~2.5 GB). After that, it's cached.

---

## 14. Key Technical Gotchas

### 1. NaN in JSON (Lane B MUST handle this)

FastF1 returns pandas DataFrames. Missing values become `float('nan')`. `json.dumps(float('nan'))` produces `NaN` which is **not valid JSON**. The browser's `JSON.parse()` will throw. See [CONTRACT.md §9](CONTRACT.md#9-the-nan-trap).

**Solution**: Run every FastF1 value through the `clean()` function defined in CONTRACT.md.

### 2. The audeering model has no AutoModel (Lane A MUST handle this)

You cannot do `AutoModelForAudioClassification.from_pretrained(...)`. You must define two custom PyTorch classes. See [IMPLEMENTATION.md](IMPLEMENTATION.md) §2.2 for the exact code.

### 3. Whisper word timestamps require specific pipeline (Lane A MUST handle this)

`return_timestamps="word"` only works with certain pipeline configurations. The `pipeline("automatic-speech-recognition", ...)` wrapper handles it, but direct `model.generate()` does not support `"word"` — only `True` (which gives chunk-level, not word-level). See [IMPLEMENTATION.md](IMPLEMENTATION.md) §2.1.

### 4. FastF1 LapNumber is a float (Lane B MUST handle this)

`lap.LapNumber` returns `52.0` not `52`. Always cast with `int(lap.LapNumber)`.

### 5. FastF1 LapTime is a Timedelta (Lane B MUST handle this)

`lap.LapTime` returns a pandas Timedelta. Convert with `float(pd.Timedelta(lap.LapTime).total_seconds())`. Never pass a Timedelta through JSON.

### 6. Whisper hallucinates on silence/noise (Lane A should handle this)

Whisper will "transcribe" engine noise and silence as actual words. Mitigation: check if `word_count < 2` or if the audio is mostly silence, and set mood to `UNKNOWN`.

### 7. CORS must be configured (Lane B MUST handle this)

The FastAPI backend must have CORS middleware allowing the frontend origin. Without this, every fetch from the browser will fail silently. See `backend/.env.example` → `CORS_ORIGINS`.

### 8. Windows vs macOS paths (everyone)

Always use `pathlib.Path` in Python, never string concatenation with `\\` or `/`. Use `os.path.join()` at minimum.

---

## 15. Glossary

| Term | Meaning |
|------|---------|
| **Arousal** | How activated/energized the voice sounds. 0 = lethargic, 1 = shouting. |
| **Valence** | How positive/negative the emotion is. 0 = very negative, 1 = very positive. |
| **Dominance** | How commanding/submissive the voice sounds. 0 = submissive, 1 = commanding. |
| **Russell's circumplex** | A psychological model that maps emotions onto a 2D space of arousal × valence. |
| **Stress index** | Our computed score: `arousal * (1 - valence)`. High arousal + negative valence = stress. |
| **Fatigue index** | Our computed score from low arousal + slow speech + long pauses. |
| **Delta_s** | Lap time minus baseline, in seconds. Positive = slower than normal. |
| **Baseline** | The driver's median clean lap time for that session. |
| **Clean lap** | An accurate, non-pit, green-flag lap. |
| **FastF1** | Python library for F1 timing data. |
| **WAV** | Audio format. All clips must be 16 kHz, mono, WAV. |
| **WPS** | Words per second — speech rate metric. |
| **SER** | Speech Emotion Recognition. |
| **ASR** | Automatic Speech Recognition. |
| **HF** | HuggingFace. |
| **Prosody** | Non-verbal speech features: rhythm, rate, pitch, volume. |
