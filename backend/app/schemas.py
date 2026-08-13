"""
Pydantic schemas — the single source of truth for all JSON shapes.
These MUST match CONTRACT.md exactly. If they diverge, CONTRACT.md wins.
"""

from enum import Enum
from typing import Optional
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
    speech_rate_wps: Optional[float] = None
    pause_ratio:     Optional[float] = Field(None, ge=0.0, le=1.0)
    mean_pause_s:    Optional[float] = None
    longest_pause_s: Optional[float] = None
    rms_energy:  Optional[float] = Field(None, ge=0.0, le=1.0)
    pitch_hz:    Optional[float] = None
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
    lap_time_s: Optional[float] = None
    delta_s:    Optional[float] = None
    compound:   Optional[str] = None
    stint:      Optional[int] = None
    tyre_life:  Optional[int] = None
    is_pit_lap: bool = False
    is_accurate: bool = True
    track_status: Optional[str] = None
    is_radio_lap: bool = False


class LapSeries(BaseModel):
    driver:    str
    race:      str
    baseline_s: Optional[float] = None
    total_laps: int
    laps:      list[LapPoint]


class LapContext(BaseModel):
    lap_number:       int
    lap_time_s:       Optional[float] = None
    baseline_s:       Optional[float] = None
    delta_s:          Optional[float] = None
    next_lap_delta_s: Optional[float] = None
    prev_lap_delta_s: Optional[float] = None
    compound:         Optional[str] = None
    trend:            TrendDirection
    window: list[LapPoint] = []


class ClipAnalysis(BaseModel):
    clip_id: str
    source:  str
    driver: Optional[str] = None
    race:   Optional[str] = None
    lap:    Optional[int] = None
    session_type: Optional[str] = None
    transcript: str
    words: list[WordTiming] = []
    asr_model: str
    prosody: ProsodyFeatures
    mood:    MoodVerdict
    lap_context: Optional[LapContext] = None
    audio_url: str
    audio_peaks: list[float] = []
    processed_at: str
    processing_ms: int
    mocked: bool = False


class ClipSummary(BaseModel):
    clip_id:    str
    driver:     Optional[str] = None
    race:       Optional[str] = None
    lap:        Optional[int] = None
    duration_s: float
    mood_label: MoodLabel
    stress_index: float
    delta_s:    Optional[float] = None
    transcript_preview: str
    audio_url:  str


class CorrelationPoint(BaseModel):
    clip_id:      str
    driver:       Optional[str] = None
    stress_index: float
    delta_s:      float
    mood_label:   MoodLabel


class CorrelationSummary(BaseModel):
    n: int
    pearson_r: Optional[float] = None
    p_value:   Optional[float] = None
    pearson_r_next_lap: Optional[float] = None
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
    agreement_rate: Optional[float] = None
    confusion_matrix: Optional[dict] = None
    mean_stress_by_human_label: Optional[dict] = None
    notes: str = ""


class ErrorResponse(BaseModel):
    error: str
    detail: str
    hint: Optional[str] = None
