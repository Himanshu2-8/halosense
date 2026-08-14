// frontend/src/lib/api.ts
import type { ClipAnalysis, ClipSummary, CorrelationSummary, HealthStatus } from "./types";
import { MOCK_CLIPS, MOCK_CORRELATION } from "./mock";

// Use relative path so Next.js proxy rewrites handle it — no CORS needed.
const API = "/api";
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "1";

async function apiError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => null);
  const detail = payload?.detail;
  if (typeof detail === "string") return new Error(detail);
  if (detail && typeof detail.detail === "string") return new Error(detail.detail);
  return new Error(fallback);
}

export async function fetchHealth(): Promise<HealthStatus> {
  if (USE_MOCKS) {
    return { status: "ok", mock_ml: true, models_loaded: false, clip_count: MOCK_CLIPS.length, version: "1.0.0" };
  }
  const res = await fetch(`${API}/health`);
  if (!res.ok) throw await apiError(res, "Backend unreachable");
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
      audio_url: "",
    }));
  }
  const params = new URLSearchParams();
  if (driver) params.set("driver", driver);
  if (mood) params.set("mood", mood);
  const res = await fetch(`${API}/clips?${params}`);
  if (!res.ok) throw await apiError(res, "Failed to fetch clips");
  return res.json();
}

export async function fetchClip(clipId: string): Promise<ClipAnalysis> {
  if (USE_MOCKS) {
    const clip = MOCK_CLIPS.find((c) => c.clip_id === clipId);
    if (!clip) throw new Error(`Clip not found: ${clipId}`);
    return { ...clip, audio_url: "" };
  }
  const res = await fetch(`${API}/clips/${clipId}`);
  if (!res.ok) throw await apiError(res, "Failed to fetch clip");
  return res.json();
}

export function analyzeAudio(
  file: File,
  metadata?: { driver?: string; race?: string; lap?: number },
  onProgress?: (pct: number) => void
): Promise<ClipAnalysis> {
  if (USE_MOCKS) {
    return new Promise((resolve) => {
      let pct = 0;
      const interval = setInterval(() => {
        pct += 20;
        if (onProgress) onProgress(pct);
        if (pct >= 100) {
          clearInterval(interval);
          resolve({ ...MOCK_CLIPS[0], audio_url: "" });
        }
      }, 300);
    });
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    if (metadata?.driver) formData.append("driver", metadata.driver);
    if (metadata?.race) formData.append("race", metadata.race);
    if (metadata?.lap) formData.append("lap", String(metadata.lap));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/analyze`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (err) {
          reject(new Error("Failed to parse response"));
        }
      } else {
        reject(new Error(`Analysis failed: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

export async function fetchCorrelation(): Promise<CorrelationSummary> {
  if (USE_MOCKS) return MOCK_CORRELATION;
  const res = await fetch(`${API}/correlation`);
  if (!res.ok) throw await apiError(res, "Failed to fetch correlation");
  return res.json();
}

export function getAudioUrl(clipId: string): string {
  if (USE_MOCKS) return "";
  return `/api/audio/${clipId}`;
}
