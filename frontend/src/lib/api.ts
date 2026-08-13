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
