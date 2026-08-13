# CONTRACT.md — The Frozen Data Contract

> **This is the single most important file in the repo.**
>
> Every one of the three lanes builds against the shapes defined here and
> nothing else. As long as all three of us obey this file, our code will
> snap together on Aug 13 evening even though we never ran each other's
> code once.
>
> **STATUS: FROZEN as of Aug 12, 20:00.**
>
> Changing anything in this file requires telling the other two people in
> the group chat *before* you push. A silent change here is the single most
> likely way this project fails. See [§10 Change Protocol](#10-change-protocol).

---

## 1. Why this file exists

We have ~52 hours until the form deadline (Aug 14, 23:59) and three people
on three machines, working separately and merging at the end.

The normal way this fails: Lane C builds a chart expecting `lapTime` in
seconds, Lane B sends `lap_time_ms` as an integer, and we discover it at
22:00 on Aug 14 with no time to fix it.

The fix is boring and it works: **agree the JSON first, then everybody
writes code that produces or consumes exactly that JSON.** Lane A and B
write Python that emits it. Lane C writes TypeScript that reads it. A
committed mock file proves both sides agree.

---

## 2. Naming rules (non-negotiable)

| Rule | Value | Why |
|---|---|---|
| JSON field casing | `snake_case` | Pydantic emits it natively; no serializer aliases to get wrong |
| Time units | **seconds, as `float`** | Never ms, never `Timedelta`, never strings |
| Score ranges | **`0.0`–`1.0` inclusive, `float`** | Every model output and index is normalized |
| Missing value | `null` | Never `0`, never `-1`, never `""`, never `NaN` |
| Enum values | `UPPER_SNAKE` strings | Cheap to compare, obvious in logs |
| Driver codes | 3-letter uppercase (`HAM`, `VER`) | Matches FastF1's `Driver` column exactly |
| Race identifier | `"<Event> <Year>"` e.g. `"Silverstone 2021"` | Human-readable, and what we show in the UI |
| IDs | `snake_case` slug, globally unique | `ham_silverstone_2021_l52` |

> **`NaN` is banned.** `float('nan')` is not valid JSON. Pandas produces it
> constantly (any empty FastF1 cell becomes `NaN`). Lane B **must** convert
> every `NaN` to `None` before returning. See
> [§9 The NaN Trap](#9-the-nan-trap) — this will bite you, guaranteed.

---

## 3. Enums

```python
# backend/app/schemas.py

from enum import Enum


class MoodLabel(str, Enum):
    """The headline verdict shown in the big card in the UI."""
    CALM     = "CALM"
    STRESSED = "STRESSED"
    TIRED    = "TIRED"
    UNKNOWN  = "UNKNOWN"   # emitted when audio was too short / no speech found


class Quadrant(str, Enum):
    """
    Russell circumplex quadrant, derived from (arousal, valence).
    This is what makes our mood call defensible instead of a vibe --
    we can point at a published psychological model in the pitch.
    """
    HIGH_AROUSAL_NEGATIVE = "HIGH_AROUSAL_NEGATIVE"   # angry, panicked, frustrated -> STRESSED
    HIGH_AROUSAL_POSITIVE = "HIGH_AROUSAL_POSITIVE"   # elated, pumped              -> CALM (focused)
    LOW_AROUSAL_NEGATIVE  = "LOW_AROUSAL_NEGATIVE"    # dejected, drained           -> TIRED
    LOW_AROUSAL_POSITIVE  = "LOW_AROUSAL_POSITIVE"    # relaxed, content            -> CALM


class TrendDirection(str, Enum):
    IMPROVING = "IMPROVING"   # lap times getting faster
    STABLE    = "STABLE"
    DEGRADING = "DEGRADING"   # lap times getting slower
```

**Frontend mirror** (`frontend/src/lib/types.ts`):

```ts
export type MoodLabel = "CALM" | "STRESSED" | "TIRED" | "UNKNOWN";

export type Quadrant =
  | "HIGH_AROUSAL_NEGATIVE"
  | "HIGH_AROUSAL_POSITIVE"
  | "LOW_AROUSAL_NEGATIVE"
  | "LOW_AROUSAL_POSITIVE";

export type TrendDirection = "IMPROVING" | "STABLE" | "DEGRADING";
```

---

## 4. The core objects

These six objects are the entire contract. Read them once, carefully.

### 4.1 `ProsodyFeatures`

Everything measured from the audio signal and the word timings. This is
where our differentiator lives — no other team will have the speech-rate
and pause features.

```python
class ProsodyFeatures(BaseModel):
    # --- from the audeering wav2vec2 emotion model (dimensional output) ---
    arousal:   float = Field(..., ge=0.0, le=1.0)  # 0 = flat/lethargic, 1 = shouting/agitated
    dominance: float = Field(..., ge=0.0, le=1.0)  # 0 = submissive, 1 = commanding
    valence:   float = Field(..., ge=0.0, le=1.0)  # 0 = very negative, 1 = very positive

    # --- derived from Whisper word-level timestamps (our own work) ---
    speech_rate_wps: float | None = None  # words per second of *voiced* time
    pause_ratio:     float | None = Field(None, ge=0.0, le=1.0)  # silent time / total time
    mean_pause_s:    float | None = None  # mean gap between consecutive words
    longest_pause_s: float | None = None

    # --- from the raw waveform (numpy, no model) ---
    rms_energy:  float | None = Field(None, ge=0.0, le=1.0)  # loudness proxy, normalized
    pitch_hz:    float | None = None  # median F0. null if librosa unavailable or unvoiced
    duration_s:  float                # length of the clip in seconds
    word_count:  int                  # number of words Whisper returned
```

**JSON:**

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
  "word_count": 17
}
```

### 4.2 `MoodVerdict`

The fusion output. Note that we ship **both** the label and the raw
indices — the indices are what make the UI feel like an instrument rather
than a magic 8-ball, and they let a judge see our reasoning.

```python
class MoodVerdict(BaseModel):
    label:      MoodLabel
    confidence: float = Field(..., ge=0.0, le=1.0)

    # The two indices the label is derived from. Always present.
    stress_index:  float = Field(..., ge=0.0, le=1.0)
    fatigue_index: float = Field(..., ge=0.0, le=1.0)

    quadrant: Quadrant

    # Human-readable justification, generated by the fusion rule, shown in
    # the UI under the label. NOT model-generated prose -- a template.
    # e.g. "High arousal (0.87) with negative valence (0.21) -> acute stress."
    rationale: str

    # Which signals actually fired, for the UI to render as chips.
    # e.g. ["high_arousal", "negative_valence", "fast_speech"]
    contributing_factors: list[str] = []
```

**JSON:**

```json
{
  "label": "STRESSED",
  "confidence": 0.81,
  "stress_index": 0.84,
  "fatigue_index": 0.19,
  "quadrant": "HIGH_AROUSAL_NEGATIVE",
  "rationale": "High arousal (0.87) with negative valence (0.21) indicates acute stress. Speech rate 3.9 w/s is above the 3.2 w/s baseline.",
  "contributing_factors": ["high_arousal", "negative_valence", "fast_speech"]
}
```

### 4.3 `LapPoint` and `LapSeries`

```python
class LapPoint(BaseModel):
    lap_number: int
    lap_time_s: float | None      # null for laps with no valid time (crash, deleted)
    delta_s:    float | None      # lap_time_s - baseline_s. Negative = faster than baseline.
    compound:   str | None        # SOFT / MEDIUM / HARD / INTERMEDIATE / WET / UNKNOWN
    stint:      int | None
    tyre_life:  int | None
    is_pit_lap: bool = False      # in-lap or out-lap; excluded from baseline
    is_accurate: bool = True      # FastF1's IsAccurate flag
    track_status: str | None      # FastF1 raw string, "1" = green
    is_radio_lap: bool = False    # a radio message in our dataset lands on this lap


class LapSeries(BaseModel):
    driver:    str                # "HAM"
    race:      str                # "Silverstone 2021"
    baseline_s: float | None      # median of clean laps -- the reference for delta_s
    total_laps: int
    laps:      list[LapPoint]
```

> `is_radio_lap` is what lets Lane C draw the marker pins on the chart
> without needing to cross-reference two arrays. Lane B sets it.

**JSON (truncated):**

```json
{
  "driver": "HAM",
  "race": "Silverstone 2021",
  "baseline_s": 89.412,
  "total_laps": 52,
  "laps": [
    {
      "lap_number": 50, "lap_time_s": 89.512, "delta_s": 0.100,
      "compound": "HARD", "stint": 2, "tyre_life": 22,
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

### 4.4 `ClipAnalysis` — the main payload

This is the object the whole app revolves around. `GET /api/clips/{id}`
returns it. `POST /api/analyze` returns it. One shape, two producers.

```python
class ClipAnalysis(BaseModel):
    # --- identity ---
    clip_id: str                  # "ham_silverstone_2021_l52", or "upload_<uuid>" for live uploads
    source:  str                  # "DATASET" | "UPLOAD"

    # --- context. All null for an unlabelled upload; that must not break the UI. ---
    driver: str | None = None
    race:   str | None = None
    lap:    int | None = None
    session_type: str | None = None   # "R" | "Q" | "FP1" ...

    # --- ASR ---
    transcript: str                   # "" if no speech detected
    words: list[WordTiming] = []      # empty if the ASR backend gave no word timings
    asr_model: str                    # echo the model id actually used, for the pitch

    # --- analysis ---
    prosody: ProsodyFeatures
    mood:    MoodVerdict

    # --- lap context. null when we have no driver/race/lap for this clip. ---
    lap_context: LapContext | None = None

    # --- playback ---
    audio_url: str                    # "/api/audio/ham_silverstone_2021_l52"

    # --- provenance ---
    processed_at: str                 # ISO-8601 UTC, e.g. "2026-08-13T14:22:01Z"
    processing_ms: int                # wall-clock inference time, nice to show in the UI
    mocked: bool = False              # TRUE when MOCK_ML=1. Never ship a demo with this true.


class WordTiming(BaseModel):
    word:  str
    start: float                      # seconds from clip start
    end:   float


class LapContext(BaseModel):
    """The lap the radio call landed on, plus its neighbours, plus the
    forward-looking question: did the driver get slower AFTER this call?"""
    lap_number:      int
    lap_time_s:      float | None
    baseline_s:      float | None
    delta_s:         float | None     # this lap vs baseline
    next_lap_delta_s: float | None    # the lap AFTER the radio call vs baseline
    prev_lap_delta_s: float | None
    compound:        str | None
    trend:           TrendDirection
    window: list[LapPoint] = []       # +/- 5 laps around lap_number, for the mini chart
```

**Full JSON example** — this exact object is committed as
`frontend/src/lib/mock.ts`, so both sides can diff against it:

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
    "duration_s": 4.32, "word_count": 17
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

### 4.5 `ClipSummary` — the list item

`GET /api/clips` returns a list of these. Deliberately small so the
sidebar renders instantly without shipping every transcript and word array.

```python
class ClipSummary(BaseModel):
    clip_id:    str
    driver:     str | None
    race:       str | None
    lap:        int | None
    duration_s: float
    mood_label: MoodLabel
    stress_index: float
    delta_s:    float | None          # so the list can show "+1.22s" next to each item
    transcript_preview: str           # first ~60 chars, ellipsised
    audio_url:  str
```

### 4.6 `CorrelationSummary` — the money slide

This is the object that produces our single headline claim. Lane B builds
it. It is the difference between "we made a mood detector" and "we found
that stress predicts lap-time loss."

```python
class CorrelationPoint(BaseModel):
    clip_id:      str
    driver:       str | None
    stress_index: float
    delta_s:      float
    mood_label:   MoodLabel


class CorrelationSummary(BaseModel):
    n: int                                  # number of clips with BOTH a stress index and a lap delta
    pearson_r: float | None                 # stress_index vs delta_s. null if n < 3.
    p_value:   float | None
    # Same, but against the NEXT lap -- does stress predict future loss?
    pearson_r_next_lap: float | None
    mean_delta_by_mood: dict[str, float]    # {"CALM": -0.04, "STRESSED": 0.83, "TIRED": 0.51}
    points: list[CorrelationPoint]
    headline: str                           # pre-written sentence for the UI and the PPT
```

**JSON:**

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

---

## 5. Envelope: how every response is wrapped

**Successful responses return the bare object.** No `{"data": ...}`
wrapper. Less code on both sides.

**Errors** always return this shape, with the correct HTTP status:

```python
class ErrorResponse(BaseModel):
    error: str        # stable machine code, UPPER_SNAKE
    detail: str       # human-readable, safe to render in a toast
    hint: str | None = None   # what the user should do about it
```

```json
{
  "error": "AUDIO_TOO_LONG",
  "detail": "Clip is 94.2s; the maximum is 60s.",
  "hint": "Trim the clip to under 60 seconds and try again."
}
```

### Error code registry

Lane B raises these. Lane C handles them. Nobody invents new ones without
adding a row here.

| HTTP | `error` | When |
|---|---|---|
| 400 | `NO_FILE` | multipart request had no `file` part |
| 400 | `UNSUPPORTED_FORMAT` | not wav/mp3/m4a/ogg/flac, or the decode failed |
| 400 | `AUDIO_TOO_LONG` | over `MAX_AUDIO_SECONDS` |
| 400 | `AUDIO_TOO_SHORT` | under 0.4s — the emotion model needs real signal |
| 400 | `INVALID_PARAM` | bad `driver` / `race` / `lap` query value |
| 404 | `CLIP_NOT_FOUND` | unknown `clip_id` |
| 404 | `LAPS_NOT_FOUND` | no committed lap JSON for that driver+race |
| 413 | `FILE_TOO_LARGE` | over `MAX_UPLOAD_MB` |
| 422 | *(FastAPI default)* | Pydantic validation failure — do not hand-raise |
| 500 | `MODEL_LOAD_FAILED` | weights missing or torch broken |
| 500 | `INFERENCE_FAILED` | model ran but threw |
| 503 | `MODELS_WARMING` | first request while weights are still downloading |

> Lane C: treat **any** non-2xx as "show the toast, keep the last good
> state on screen." Never blank the page on an error — a blank page during
> a live demo looks like a crash.

---

## 6. The mock fixture (this is what unblocks everyone)

Two files, committed on Aug 12, before any real code exists.

**`frontend/src/lib/mock.ts`** — Lane C's entire world until integration.
Must contain **5 clips minimum**, and they must cover every visual state:

| Mock clip | Purpose — forces Lane C to design for it |
|---|---|
| 1. `STRESSED`, high confidence, big positive delta | the hero case, used in the demo video |
| 2. `CALM`, negative delta | proves the UI isn't hardcoded to look alarming |
| 3. `TIRED`, moderate delta | exercises the third label + the fatigue chips |
| 4. `UNKNOWN`, `lap_context: null`, empty `words[]` | **the upload-with-no-metadata case.** If Lane C doesn't handle this, the live upload demo crashes. |
| 5. long transcript (~40 words), `pitch_hz: null` | tests text overflow and null-field rendering |

**`data/cache/analyses.json`** — the same five objects in Python-land, so
Lane B's `GET /api/clips` returns real-shaped data on day one without
any model being installed.

> **Rule:** these two files must stay byte-equivalent in content. When
> Lane A's real precompute overwrites `analyses.json` on Aug 13, run
> `pytest backend/tests/test_contract.py` to confirm the shape didn't
> drift.

---

## 7. Mock mode, precisely

Two independent switches. Understand both or you will waste an hour.

| Switch | Where | Effect |
|---|---|---|
| `MOCK_ML=1` | `backend/.env` | FastAPI runs for real (real routes, real HTTP, real CORS) but the **ML services** return canned data. No torch import, no downloads. Boots in <2s. |
| `NEXT_PUBLIC_USE_MOCKS=1` | `frontend/.env.local` | The frontend never makes a network call at all. Reads `src/lib/mock.ts`. |

Which combination each lane uses, and when:

| Phase | Lane A (ML) | Lane B (Backend) | Lane C (Frontend) |
|---|---|---|---|
| Aug 12–13, solo work | `MOCK_ML=0` | `MOCK_ML=1` | `USE_MOCKS=1` |
| Aug 13 eve, integration | — | `MOCK_ML=0` | `USE_MOCKS=0` |
| Demo / deploy | `MOCK_ML=0` everywhere | | `USE_MOCKS=0` |

**Hard rule:** every response carries `"mocked": true|false`. Before
recording the demo video, confirm it is `false`. Shipping a demo with
`mocked: true` and not noticing is an embarrassing, entirely preventable
failure — so `NEXT_PUBLIC_SHOW_DEV_BANNER=1` paints a loud banner while
mocks are on.

---

## 8. Contract test (the tripwire)

`backend/tests/test_contract.py` — runs in <1s, needs no models. Anyone
can run it any time, and CI-less as we are, it's our only safety net.

It asserts:

1. Every object in `data/cache/analyses.json` validates against `ClipAnalysis`.
2. Every `MoodLabel` / `Quadrant` / `TrendDirection` value in that file is a legal enum member.
3. No `NaN` or `Infinity` appears anywhere in the serialized JSON.
4. Every `0.0–1.0` field is genuinely inside `[0, 1]`.
5. Every `audio_url` resolves to a file that exists in `data/clips/`.
6. `mock.ts` and `analyses.json` contain the same set of `clip_id`s.

> **Run this before every push.** It is the difference between "merge took
> 20 minutes" and "merge took 4 hours."

---

## 9. The NaN trap

Read this paragraph twice, Lane B.

FastF1 returns a pandas DataFrame. Any missing cell — a driver who didn't
set a lap time, a `Compound` that wasn't recorded, `Position` during
qualifying — comes back as `float('nan')` or `pd.NaT`.

`json.dumps(float('nan'))` produces the literal token `NaN`, which is
**not valid JSON**. `JSON.parse()` in the browser throws on it. FastAPI
will happily serialize it and the frontend will die with a parse error
that points nowhere near the real cause.

Every DataFrame → dict conversion must pass through this:

```python
import math
import pandas as pd

def clean(value):
    """pandas/numpy missing value -> None. Call on EVERY scalar from a DataFrame."""
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    # numpy scalars are not JSON-serializable either
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def td_to_seconds(td) -> float | None:
    """FastF1 Timedelta -> float seconds, or None. NEVER return a Timedelta."""
    if td is None or pd.isna(td):
        return None
    return float(pd.Timedelta(td).total_seconds())
```

Also note: **`LapNumber` is a `float` in FastF1**, not an int. Cast it
with `int(lap.LapNumber)` or the frontend gets `52.0` where it expects
`52`, and `Object.keys` lookups silently miss.

---

## 10. Change protocol

If you genuinely must change a shape in this file:

1. **Post in the group chat first.** Say exactly which field, and why.
2. Update this file **and** all three of: `backend/app/schemas.py`,
   `frontend/src/lib/types.ts`, `frontend/src/lib/mock.ts`.
3. Update `data/cache/analyses.json` if the change touches `ClipAnalysis`.
4. Run `pytest backend/tests/test_contract.py`.
5. Push **immediately** — do not sit on a contract change for an hour.
6. Tell the other two to pull.

**Additive changes are cheap** (a new optional field with a default breaks
nobody). **Renames and type changes are expensive.** After Aug 13 22:00,
only additive changes are allowed — at that point a rename is not worth
the merge risk, no matter how ugly the name is.

---

## 11. Quick reference card

Pin this. It's the whole contract in twelve lines.

```
GET  /api/health                 -> HealthStatus
GET  /api/clips                  -> ClipSummary[]
GET  /api/clips/{clip_id}        -> ClipAnalysis
POST /api/analyze  (multipart)   -> ClipAnalysis
GET  /api/laps?driver=&race=     -> LapSeries
GET  /api/correlation            -> CorrelationSummary
GET  /api/audio/{clip_id}        -> audio/wav bytes
GET  /api/eval                   -> EvalSummary

seconds as float   |   scores 0..1   |   missing = null   |   snake_case
NaN is banned      |   LapNumber -> int()   |   errors = {error, detail, hint}
```

See `docs/ROUTES.md` for the full per-route specification and
`docs/SERVICES.md` for what computes each field.
