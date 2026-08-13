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
  audio_peaks: number[];
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
