# ROUTES.md — API Endpoint Specification

> **Lane B builds these routes. Lane C consumes them.**
> Every route, every parameter, every response shape is defined here.
> If it's not in this file, it doesn't exist.

---

## Base URL

- **Local dev**: `http://localhost:8000`
- **Deployed**: `https://<hf-username>-silent-codriver.hf.space`

All routes are prefixed with `/api/`.

---

## Quick Reference

```
GET  /api/health                 → HealthStatus
GET  /api/clips                  → ClipSummary[]
GET  /api/clips/{clip_id}        → ClipAnalysis
POST /api/analyze                → ClipAnalysis       (multipart/form-data)
GET  /api/laps?driver=&race=     → LapSeries
GET  /api/correlation            → CorrelationSummary
GET  /api/audio/{clip_id}        → audio/wav bytes
GET  /api/eval                   → EvalSummary
```

---

## Route 1: `GET /api/health`

### Purpose
Health check for monitoring and startup verification. The frontend calls this on load to check if the backend is reachable.

### Request
```
GET /api/health
```

No parameters.

### Response — `200 OK`

```python
# backend/app/schemas.py
class HealthStatus(BaseModel):
    status: str = "ok"
    mock_ml: bool              # True when MOCK_ML=1
    models_loaded: bool        # True after first real inference
    clip_count: int            # Number of clips in analyses.json cache
    version: str = "1.0.0"
```

```json
{
  "status": "ok",
  "mock_ml": false,
  "models_loaded": true,
  "clip_count": 28,
  "version": "1.0.0"
}
```

### Implementation notes (Lane B)

```python
# backend/app/routes/health.py
from fastapi import APIRouter
from app.config import settings
from app.services.cache_service import get_cache

router = APIRouter()

@router.get("/health")
async def health():
    cache = get_cache()
    return {
        "status": "ok",
        "mock_ml": settings.MOCK_ML,
        "models_loaded": not settings.MOCK_ML,  # simplified; real check would query services
        "clip_count": len(cache),
        "version": "1.0.0",
    }
```

### Frontend usage (Lane C)

```typescript
// On app load, call this to show/hide connection status
const res = await fetch(`${API_BASE}/api/health`);
if (!res.ok) {
  // Show "Backend unreachable" banner
}
const health: HealthStatus = await res.json();
if (health.mock_ml) {
  // Show "Backend is in mock mode" warning
}
```

---

## Route 2: `GET /api/clips`

### Purpose
Returns a list of all analyzed clips. Powers the sidebar. Returns lightweight summaries, not the full analysis.

### Request
```
GET /api/clips
GET /api/clips?driver=HAM
GET /api/clips?mood=STRESSED
GET /api/clips?driver=HAM&mood=STRESSED
```

### Query Parameters

| Param | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `driver` | string | no | (all) | 3-letter driver code, e.g. `HAM` |
| `mood` | string | no | (all) | One of: `CALM`, `STRESSED`, `TIRED`, `UNKNOWN` |

### Response — `200 OK`

```python
# Returns a JSON array of ClipSummary
class ClipSummary(BaseModel):
    clip_id:    str
    driver:     str | None
    race:       str | None
    lap:        int | None
    duration_s: float
    mood_label: MoodLabel
    stress_index: float
    delta_s:    float | None
    transcript_preview: str     # First ~60 chars, ellipsised
    audio_url:  str
```

```json
[
  {
    "clip_id": "ham_silverstone_2021_l52",
    "driver": "HAM",
    "race": "Silverstone 2021",
    "lap": 52,
    "duration_s": 4.32,
    "mood_label": "STRESSED",
    "stress_index": 0.84,
    "delta_s": 1.221,
    "transcript_preview": "Bono, my tyres are gone!",
    "audio_url": "/api/audio/ham_silverstone_2021_l52"
  },
  {
    "clip_id": "rai_abu_dhabi_2018_l53",
    "driver": "RAI",
    "race": "Abu Dhabi 2018",
    "lap": 53,
    "duration_s": 3.10,
    "mood_label": "CALM",
    "stress_index": 0.22,
    "delta_s": -0.04,
    "transcript_preview": "Leave me alone, I know what I'm doing.",
    "audio_url": "/api/audio/rai_abu_dhabi_2018_l53"
  }
]
```

### Implementation notes (Lane B)

```python
# backend/app/routes/clips.py
from fastapi import APIRouter, Query
from app.services.cache_service import get_cache
from app.schemas import ClipSummary

router = APIRouter()

@router.get("/clips", response_model=list[ClipSummary])
async def list_clips(
    driver: str | None = Query(None, description="Filter by 3-letter driver code"),
    mood: str | None = Query(None, description="Filter by mood label"),
):
    cache = get_cache()  # returns dict[clip_id, ClipAnalysis]
    results = []
    for clip_id, analysis in cache.items():
        # Apply filters
        if driver and analysis.get("driver") != driver:
            continue
        if mood and analysis.get("mood", {}).get("label") != mood:
            continue
        
        # Build summary
        transcript = analysis.get("transcript", "")
        preview = (transcript[:57] + "...") if len(transcript) > 60 else transcript
        
        results.append(ClipSummary(
            clip_id=clip_id,
            driver=analysis.get("driver"),
            race=analysis.get("race"),
            lap=analysis.get("lap"),
            duration_s=analysis["prosody"]["duration_s"],
            mood_label=analysis["mood"]["label"],
            stress_index=analysis["mood"]["stress_index"],
            delta_s=analysis.get("lap_context", {}).get("delta_s") if analysis.get("lap_context") else None,
            transcript_preview=preview,
            audio_url=f"/api/audio/{clip_id}",
        ))
    
    return results
```

### Error responses

| HTTP | Error | When |
|------|-------|------|
| 400 | `INVALID_PARAM` | `mood` is not a valid MoodLabel value |

---

## Route 3: `GET /api/clips/{clip_id}`

### Purpose
Returns the full analysis for a single clip. This is the main payload — everything the frontend needs to render the detail view.

### Request
```
GET /api/clips/ham_silverstone_2021_l52
```

### Path Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `clip_id` | string | yes | The clip identifier, e.g. `ham_silverstone_2021_l52` |

### Response — `200 OK`

Returns a full `ClipAnalysis` object. See [CONTRACT.md §4.4](CONTRACT.md#44-clipanalysis--the-main-payload) for the complete schema.

```json
{
  "clip_id": "ham_silverstone_2021_l52",
  "source": "DATASET",
  "driver": "HAM",
  "race": "Silverstone 2021",
  "lap": 52,
  "session_type": "R",
  "transcript": "Bono, my tyres are gone!",
  "words": [
    { "word": "Bono,", "start": 0.12, "end": 0.58 },
    { "word": "my",    "start": 0.69, "end": 0.81 },
    { "word": "tyres", "start": 0.84, "end": 1.22 },
    { "word": "are",   "start": 1.26, "end": 1.41 },
    { "word": "gone!", "start": 1.44, "end": 2.05 }
  ],
  "asr_model": "openai/whisper-small",
  "prosody": {
    "arousal": 0.87, "dominance": 0.64, "valence": 0.21,
    "speech_rate_wps": 3.94, "pause_ratio": 0.08,
    "mean_pause_s": 0.11, "longest_pause_s": 0.34,
    "rms_energy": 0.71, "pitch_hz": 198.4,
    "duration_s": 4.32, "word_count": 5
  },
  "mood": {
    "label": "STRESSED", "confidence": 0.81,
    "stress_index": 0.84, "fatigue_index": 0.19,
    "quadrant": "HIGH_AROUSAL_NEGATIVE",
    "rationale": "High arousal (0.87) with negative valence (0.21) indicates acute stress.",
    "contributing_factors": ["high_arousal", "negative_valence", "fast_speech"]
  },
  "lap_context": {
    "lap_number": 52,
    "lap_time_s": 90.633,
    "baseline_s": 89.412,
    "delta_s": 1.221,
    "next_lap_delta_s": 1.884,
    "prev_lap_delta_s": 0.100,
    "compound": "HARD",
    "trend": "DEGRADING",
    "window": []
  },
  "audio_url": "/api/audio/ham_silverstone_2021_l52",
  "processed_at": "2026-08-13T14:22:01Z",
  "processing_ms": 1840,
  "mocked": false
}
```

### Implementation notes (Lane B)

```python
# backend/app/routes/clips.py

@router.get("/clips/{clip_id}", response_model=ClipAnalysis)
async def get_clip(clip_id: str):
    cache = get_cache()
    if clip_id not in cache:
        raise HTTPException(
            status_code=404,
            detail={"error": "CLIP_NOT_FOUND", "detail": f"No clip with id '{clip_id}'", "hint": "Check /api/clips for available clip_ids."}
        )
    return cache[clip_id]
```

### Error responses

| HTTP | Error | When |
|------|-------|------|
| 404 | `CLIP_NOT_FOUND` | No clip with that `clip_id` in the cache |

---

## Route 4: `POST /api/analyze`

### Purpose
Live analysis of an uploaded audio file. This is the endpoint that proves we have a connected frontend + backend with real ML. The frontend's upload panel calls this.

### Request

```
POST /api/analyze
Content-Type: multipart/form-data
```

### Form Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `file` | File (binary) | **yes** | Audio file: `.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac` |
| `driver` | string | no | 3-letter driver code. If provided, enables lap context lookup. |
| `race` | string | no | Race name, e.g. `"Silverstone 2021"` |
| `lap` | integer | no | Lap number. All three (driver, race, lap) needed for lap context. |

### Response — `200 OK`

Returns a full `ClipAnalysis` object. The `clip_id` will be `"upload_<uuid>"`, and `source` will be `"UPLOAD"`.

If `driver`, `race`, and `lap` are all provided AND we have lap data for that driver+race, `lap_context` will be populated. Otherwise `lap_context` will be `null`.

```json
{
  "clip_id": "upload_a1b2c3d4",
  "source": "UPLOAD",
  "driver": null,
  "race": null,
  "lap": null,
  "session_type": null,
  "transcript": "I think we should box now, the rears are completely gone.",
  "words": [...],
  "asr_model": "openai/whisper-small",
  "prosody": { ... },
  "mood": { ... },
  "lap_context": null,
  "audio_url": "/api/audio/upload_a1b2c3d4",
  "processed_at": "2026-08-13T15:30:00Z",
  "processing_ms": 3200,
  "mocked": false
}
```

### Implementation notes (Lane B)

```python
# backend/app/routes/analyze.py
import uuid
import time
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.config import settings
from app.schemas import ClipAnalysis, ErrorResponse
from app.services.cache_service import add_to_cache

router = APIRouter()

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".flac"}

@router.post("/analyze", response_model=ClipAnalysis)
async def analyze_audio(
    file: UploadFile = File(...),
    driver: str | None = Form(None),
    race: str | None = Form(None),
    lap: int | None = Form(None),
):
    # 1. Validate file
    if not file.filename:
        raise HTTPException(400, {"error": "NO_FILE", "detail": "No file uploaded.", "hint": "Attach an audio file."})
    
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, {
            "error": "UNSUPPORTED_FORMAT",
            "detail": f"Format '{ext}' is not supported.",
            "hint": f"Use one of: {', '.join(ALLOWED_EXTENSIONS)}"
        })
    
    # 2. Read file and check size
    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, {
            "error": "FILE_TOO_LARGE",
            "detail": f"File is {len(contents) / 1024 / 1024:.1f} MB; max is {settings.MAX_UPLOAD_MB} MB.",
            "hint": f"Keep the file under {settings.MAX_UPLOAD_MB} MB."
        })
    
    # 3. Save to temp file
    clip_id = f"upload_{uuid.uuid4().hex[:8]}"
    upload_dir = Path(settings.UPLOADS_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    wav_path = upload_dir / f"{clip_id}.wav"
    wav_path.write_bytes(contents)
    
    # 4. Run analysis
    start_ms = time.time()
    
    if settings.MOCK_ML:
        # Return mock data (Lane B can do this without torch)
        from app.services.cache_service import get_mock_analysis
        result = get_mock_analysis(clip_id)
    else:
        # Call Lane A's pipeline
        from app.services.fusion_service import analyze_audio as run_pipeline
        result = run_pipeline(str(wav_path), device=settings.DEVICE)
    
    processing_ms = int((time.time() - start_ms) * 1000)
    
    # 5. Enrich with metadata
    result["clip_id"] = clip_id
    result["source"] = "UPLOAD"
    result["driver"] = driver
    result["race"] = race
    result["lap"] = lap
    result["session_type"] = None
    result["audio_url"] = f"/api/audio/{clip_id}"
    result["processed_at"] = datetime.utcnow().isoformat() + "Z"
    result["processing_ms"] = processing_ms
    
    # 6. Add lap context if metadata provided
    if driver and race and lap:
        from app.services.lap_service import get_lap_context
        result["lap_context"] = get_lap_context(driver, race, lap)
    else:
        result["lap_context"] = None
    
    # 7. Cache the result (so it appears in /api/clips)
    add_to_cache(clip_id, result)
    
    return result
```

### Error responses

| HTTP | Error | When |
|------|-------|------|
| 400 | `NO_FILE` | No `file` field in the multipart request |
| 400 | `UNSUPPORTED_FORMAT` | File extension not in allowed list |
| 400 | `AUDIO_TOO_SHORT` | Audio is under 0.4 seconds |
| 400 | `AUDIO_TOO_LONG` | Audio exceeds `MAX_AUDIO_SECONDS` (60s) |
| 413 | `FILE_TOO_LARGE` | File size exceeds `MAX_UPLOAD_MB` (15 MB) |
| 500 | `MODEL_LOAD_FAILED` | Model weights missing or torch error |
| 500 | `INFERENCE_FAILED` | Model ran but threw an exception |
| 503 | `MODELS_WARMING` | First request while weights are downloading |

### Frontend usage (Lane C)

```typescript
const formData = new FormData();
formData.append("file", selectedFile);
if (driver) formData.append("driver", driver);
if (race) formData.append("race", race);
if (lap) formData.append("lap", String(lap));

const res = await fetch(`${API_BASE}/api/analyze`, {
  method: "POST",
  body: formData,
  // Do NOT set Content-Type header — browser sets it with boundary
});

if (!res.ok) {
  const err = await res.json();
  showToast(err.detail, err.hint);
  return;
}

const analysis: ClipAnalysis = await res.json();
// Display the result inline
```

---

## Route 5: `GET /api/laps`

### Purpose
Returns full lap-time series for a driver+race combination. Powers the detailed lap chart. The lap data comes from precomputed FastF1 JSONs in `data/laps/`.

### Request
```
GET /api/laps?driver=HAM&race=Silverstone+2021
```

### Query Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `driver` | string | **yes** | 3-letter driver code |
| `race` | string | **yes** | Race name, e.g. `"Silverstone 2021"` |

### Response — `200 OK`

```python
class LapSeries(BaseModel):
    driver:     str
    race:       str
    baseline_s: float | None
    total_laps: int
    laps:       list[LapPoint]
```

```json
{
  "driver": "HAM",
  "race": "Silverstone 2021",
  "baseline_s": 89.412,
  "total_laps": 52,
  "laps": [
    {
      "lap_number": 1, "lap_time_s": 94.123, "delta_s": 4.711,
      "compound": "MEDIUM", "stint": 1, "tyre_life": 1,
      "is_pit_lap": false, "is_accurate": true, "track_status": "1",
      "is_radio_lap": false
    },
    {
      "lap_number": 52, "lap_time_s": 90.633, "delta_s": 1.221,
      "compound": "HARD", "stint": 2, "tyre_life": 24,
      "is_pit_lap": false, "is_accurate": true, "track_status": "1",
      "is_radio_lap": true
    }
  ]
}
```

### Implementation notes (Lane B)

```python
# backend/app/routes/laps.py
from fastapi import APIRouter, Query, HTTPException
from app.services.lap_service import get_lap_series

router = APIRouter()

@router.get("/laps", response_model=LapSeries)
async def laps(
    driver: str = Query(..., description="3-letter driver code"),
    race: str = Query(..., description="Race name"),
):
    series = get_lap_series(driver, race)
    if series is None:
        raise HTTPException(404, {
            "error": "LAPS_NOT_FOUND",
            "detail": f"No lap data for {driver} at {race}.",
            "hint": "Check that data/laps/ contains a JSON for this driver+race."
        })
    return series
```

### Error responses

| HTTP | Error | When |
|------|-------|------|
| 400 | `INVALID_PARAM` | `driver` or `race` missing |
| 404 | `LAPS_NOT_FOUND` | No JSON file for that driver+race in `data/laps/` |

---

## Route 6: `GET /api/correlation`

### Purpose
Returns the aggregate correlation between stress and lap-time delta across all clips. This is the "money slide" — the headline finding for the demo and PPT.

### Request
```
GET /api/correlation
```

No parameters.

### Response — `200 OK`

```python
class CorrelationSummary(BaseModel):
    n: int
    pearson_r: float | None
    p_value: float | None
    pearson_r_next_lap: float | None
    mean_delta_by_mood: dict[str, float]
    points: list[CorrelationPoint]
    headline: str
```

```json
{
  "n": 28,
  "pearson_r": 0.61,
  "p_value": 0.0006,
  "pearson_r_next_lap": 0.44,
  "mean_delta_by_mood": { "CALM": -0.04, "STRESSED": 0.83, "TIRED": 0.51 },
  "points": [
    { "clip_id": "ham_silverstone_2021_l52", "driver": "HAM",
      "stress_index": 0.84, "delta_s": 1.221, "mood_label": "STRESSED" }
  ],
  "headline": "Across 28 radio messages, stress index correlates with lap-time loss at r = 0.61 (p < 0.001). Messages flagged STRESSED averaged +0.83s versus the driver's clean-lap baseline."
}
```

### Implementation notes (Lane B)

```python
# backend/app/routes/correlation.py
from fastapi import APIRouter
from app.services.correlation_service import compute_correlation

router = APIRouter()

@router.get("/correlation", response_model=CorrelationSummary)
async def correlation():
    return compute_correlation()
```

The actual computation lives in `app/services/correlation_service.py`. See [SERVICES.md](SERVICES.md) for the full logic.

---

## Route 7: `GET /api/audio/{clip_id}`

### Purpose
Serves the raw audio WAV file for browser playback. The frontend's audio player and WaveSurfer.js use this URL.

### Request
```
GET /api/audio/ham_silverstone_2021_l52
```

### Path Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `clip_id` | string | yes | Clip identifier |

### Response — `200 OK`

- **Content-Type**: `audio/wav`
- **Body**: Raw WAV bytes
- The response should include `Accept-Ranges: bytes` for seeking support

### Implementation notes (Lane B)

```python
# backend/app/routes/audio.py
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.config import settings

router = APIRouter()

@router.get("/audio/{clip_id}")
async def get_audio(clip_id: str):
    # Check clips directory first (dataset clips)
    clip_path = Path(settings.CLIPS_DIR) / f"{clip_id}.wav"
    if clip_path.exists():
        return FileResponse(clip_path, media_type="audio/wav")
    
    # Check uploads directory (live uploads)
    upload_path = Path(settings.UPLOADS_DIR) / f"{clip_id}.wav"
    if upload_path.exists():
        return FileResponse(upload_path, media_type="audio/wav")
    
    raise HTTPException(404, {
        "error": "CLIP_NOT_FOUND",
        "detail": f"No audio file for clip '{clip_id}'.",
        "hint": "The clip may not have been uploaded or the file is missing from data/clips/."
    })
```

### Error responses

| HTTP | Error | When |
|------|-------|------|
| 404 | `CLIP_NOT_FOUND` | No WAV file found for that clip_id |

---

## Route 8: `GET /api/eval`

### Purpose
Returns evaluation metrics by comparing model predictions against hand labels (from `data/labels.csv`). This is optional but impresses judges — it shows you evaluated your own system.

### Request
```
GET /api/eval
```

No parameters.

### Response — `200 OK`

```python
class EvalSummary(BaseModel):
    n_labeled: int                          # How many clips have hand labels
    agreement_rate: float | None            # % where model label == human label
    confusion_matrix: dict | None           # {predicted: {actual: count}}
    mean_stress_by_human_label: dict | None # {"STRESSED": 0.78, "CALM": 0.25}
    notes: str = ""
```

```json
{
  "n_labeled": 25,
  "agreement_rate": 0.72,
  "confusion_matrix": {
    "STRESSED": { "STRESSED": 12, "CALM": 2, "TIRED": 0 },
    "CALM":     { "STRESSED": 1,  "CALM": 6, "TIRED": 1 },
    "TIRED":    { "STRESSED": 0,  "CALM": 1, "TIRED": 2 }
  },
  "mean_stress_by_human_label": { "STRESSED": 0.78, "CALM": 0.25, "TIRED": 0.38 },
  "notes": "Evaluated against 25 hand-labeled clips. Labels are subjective (single annotator)."
}
```

### Implementation notes (Lane B)

This route reads from `data/labels.csv` and compares against `data/cache/analyses.json`. If `labels.csv` is empty or doesn't exist, return `{"n_labeled": 0, ...}` with null fields.

### Error responses

None — this route always returns 200. If no labels exist, it returns zeros/nulls.

---

## CORS Configuration

All routes must be accessible from the frontend origin. Lane B must add CORS middleware in `main.py`:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

The `CORS_ORIGINS` env var defaults to `http://localhost:3000,http://127.0.0.1:3000`.

---

## Error Response Format (all routes)

Every non-2xx response returns this shape:

```json
{
  "error": "UPPER_SNAKE_CODE",
  "detail": "Human-readable message safe to show in a toast.",
  "hint": "What the user should do about it."
}
```

The frontend should:
1. Show `detail` in a toast notification
2. Show `hint` below the toast if present
3. **Never blank the page** on an error — keep the last good state visible

See [CONTRACT.md §5](CONTRACT.md#5-envelope-how-every-response-is-wrapped) for the complete error code registry.
