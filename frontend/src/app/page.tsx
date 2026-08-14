"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ScatterChart, Scatter, ReferenceLine, Label, Cell,
} from "recharts";
import { fetchClips, fetchClip, fetchCorrelation, fetchHealth, analyzeAudio } from "../lib/api";
import type { ClipSummary, ClipAnalysis, CorrelationSummary, HealthStatus, LapPoint } from "../lib/types";

const MOOD_COLORS: Record<string, string> = {
  Focused: "#00d4ff",
  Frustrated: "#e8002d",
  Calm: "#00e676",
  Aggressive: "#ff8c00",
  Anxious: "#c84bff",
  Neutral: "#5a6e8a",
  STRESSED: "#e8002d",
  CALM: "#00e676",
  TIRED: "#ff8c00",
  UNKNOWN: "#5a6e8a",
};

const TYRE_COLORS: Record<string, string> = {
  Soft: "#e8002d", Medium: "#ffcc00", Hard: "#e8e8e8",
  SOFT: "#e8002d", MEDIUM: "#ffcc00", HARD: "#e8e8e8",
};

const WAVE_BARS = Array.from({ length: 90 }, (_, i) => {
  const envelope = Math.sin((i / 90) * Math.PI);
  const mid = 0.4 + 0.45 * Math.sin(i * 0.18) * Math.cos(i * 0.055);
  const noise = ((Math.sin(i * 127.1 + 311.7) * 43758.5) % 1 + 1) / 2;
  return Math.max(0.06, Math.min(1, mid * envelope + noise * 0.25));
});

function MoodPill({ mood, small = false }: { mood: string; small?: boolean }) {
  const color = MOOD_COLORS[mood] ?? "#5a6e8a";
  return (
    <span
      className={`inline-flex items-center font-mono font-semibold tracking-widest uppercase rounded-sm ${small ? "text-[9px] px-1.5 py-px" : "text-[10px] px-2.5 py-1"}`}
      style={{ color, background: `${color}1a`, border: `1px solid ${color}44` }}
    >
      {mood}
    </span>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const gain = delta <= 0;
  return (
    <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap ${gain ? "text-[#00e676] bg-[#00e67615] border border-[#00e67640]" : "text-[#e8002d] bg-[#e8002d15] border border-[#e8002d40]"}`}>
      {delta > 0 ? "+" : ""}{delta.toFixed(3)}s
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-[3px] h-4 rounded-full bg-[#e8002d]" />
      <span className="font-display text-[9px] font-bold tracking-[0.22em] uppercase text-[#5a6e8a]">{children}</span>
    </div>
  );
}

const CARBON = {
  backgroundImage:
    "repeating-linear-gradient(45deg,rgba(255,255,255,0.012) 0px,rgba(255,255,255,0.012) 1px,transparent 1px,transparent 5px)," +
    "repeating-linear-gradient(-45deg,rgba(255,255,255,0.012) 0px,rgba(255,255,255,0.012) 1px,transparent 1px,transparent 5px)",
};

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[2px] border border-[#1c2638] bg-[#0b0f18] p-4 ${className}`} style={CARBON}>
      {children}
    </div>
  );
}

// ─── Player ─────────────────────────

function AudioPlayer({ summary, analysis, onProgress }: { summary: ClipSummary; analysis: ClipAnalysis; onProgress: (p: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { onProgress(progress); }, [progress, onProgress]);

  const DURATION = summary.duration_s || 18;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, "0")}`;
  const moodColor = MOOD_COLORS[summary.mood_label] ?? "#e8002d";
  const peaks = analysis.audio_peaks?.length ? analysis.audio_peaks : WAVE_BARS;

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setProgress(p);
    if (audioRef.current) audioRef.current.currentTime = p * DURATION;
  }, [DURATION]);

  const togglePlay = () => {
    if (!audioRef.current || !audioRef.current.src) return;
    if (playing) audioRef.current.pause();
    else {
      void audioRef.current.play().then(() => setPlaying(true)).catch(() => {
        setPlaying(false);
        setMediaError(true);
      });
      return;
    }
    setPlaying(false);
  };

  return (
    <Panel>
      <SectionLabel>Audio Player · Waveform</SectionLabel>
      <audio
        ref={audioRef}
        src={analysis.audio_url || undefined}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / DURATION)}
        onEnded={() => { setPlaying(false); setProgress(1); }}
        onError={() => { setPlaying(false); setMediaError(true); }}
      />
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="font-display text-sm font-black tracking-[0.15em] uppercase mb-0.5" style={{ color: moodColor, textShadow: `0 0 16px ${moodColor}60` }}>{summary.driver || "Unknown"}</div>
          <div className="font-mono text-[10px] text-[#5a6e8a]">{summary.race || "Track"} &nbsp;·&nbsp; LAP {summary.lap || "?"}</div>
        </div>
        <div className="flex items-center gap-2">
          <MoodPill mood={summary.mood_label} />
          <span className="font-mono text-[10px] text-[#2d3d55] border border-[#1c2638] px-2 py-0.5 rounded-sm">{fmt(DURATION)}</span>
        </div>
      </div>

      <div className="relative flex items-center gap-px h-16 cursor-crosshair mb-3" onClick={seek}>
        {peaks.map((h, i) => {
          const pos = i / peaks.length;
          const active = pos < progress;
          return (
            <div key={i} className="flex-1 rounded-[1px] transition-colors duration-75"
              style={{
                height: `${h * 100}%`,
                background: active ? `rgba(232,0,45,${0.5 + h * 0.5})` : `rgba(90,110,138,${0.2 + h * 0.4})`,
                boxShadow: active ? "0 0 3px rgba(232,0,45,0.35)" : "none",
              }}
            />
          );
        })}
        <div className="absolute top-0 bottom-0 w-px pointer-events-none" style={{ left: `${progress * 100}%`, background: "#00d4ff", boxShadow: "0 0 10px #00d4ff" }}>
          <div className="absolute -top-1.5 -translate-x-1/2 w-3 h-3 rotate-45 bg-[#00d4ff] shadow-[0_0_10px_#00d4ff]" />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button onClick={togglePlay} className="relative flex items-center justify-center w-10 h-10 rounded-full border border-[#e8002d] bg-[#e8002d15] hover:bg-[#e8002d30] transition-colors">
          {playing && <div className="absolute inset-0 rounded-full border border-[#e8002d] animate-ping opacity-30" />}
          {playing
            ? <svg width="14" height="14" viewBox="0 0 14 14" fill="#e8002d"><rect x="2" y="1.5" width="3.5" height="11" rx="1" /><rect x="8.5" y="1.5" width="3.5" height="11" rx="1" /></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" fill="#e8002d"><path d="M3 1.5 13.5 7 3 12.5z" /></svg>
          }
        </button>
        <span className="font-mono text-[12px] font-bold text-[#00d4ff] tabular-nums">{fmt(progress * DURATION)}</span>
        <div className="flex-1 h-1.5 bg-[#1c2638] rounded-full overflow-hidden cursor-pointer" onClick={seek}>
          <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg,#a00020,#e8002d)" }} />
        </div>
        <span className="font-mono text-[11px] text-[#5a6e8a] tabular-nums">{fmt(DURATION)}</span>
      </div>
      {mediaError && (
        <p className="mt-3 font-mono text-[9px] text-[#ff8c00]">
          Audio is unavailable for this clip. The saved analysis remains viewable.
        </p>
      )}
    </Panel>
  );
}

// ─── Mood Card ─────────────────────────

function MoodCard({ summary, analysis }: { summary: ClipSummary; analysis: ClipAnalysis }) {
  const color = MOOD_COLORS[summary.mood_label] ?? "#5a6e8a";
  const conf = Math.round(analysis.mood.confidence * 100);
  const stress = Math.round(analysis.mood.stress_index * 100);
  const fatigue = Math.round(analysis.mood.fatigue_index * 100);

  return (
    <div className="flex-1 rounded-[2px] border p-4 overflow-hidden"
      style={{ borderColor: `${color}40`, backgroundImage: `radial-gradient(ellipse at top left,${color}0e 0%,#0b0f18 60%),${CARBON.backgroundImage}` }}
    >
      <SectionLabel>Mood Analysis</SectionLabel>
      <div className="font-display text-4xl font-black tracking-widest uppercase mb-1 leading-none" style={{ color, textShadow: `0 0 24px ${color}50` }}>{summary.mood_label}</div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 h-1.5 bg-[#1c2638] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${conf}%`, background: `linear-gradient(90deg,${color}80,${color})` }} />
        </div>
        <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color }}>{conf}%</span>
        <span className="font-mono text-[9px] text-[#5a6e8a] tracking-wider uppercase">Confidence</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {[{ label: "Stress Index", value: stress, accent: "#e8002d" }, { label: "Fatigue Index", value: fatigue, accent: "#ff8c00" }].map(({ label, value, accent }) => (
          <div key={label} className="rounded-[2px] border border-[#1c2638] bg-[#06080d] p-3">
            <div className="font-mono text-[28px] font-black leading-none mb-1 tabular-nums" style={{ color: accent }}>{value}</div>
            <div className="font-mono text-[9px] text-[#5a6e8a] tracking-widest uppercase mb-1.5">{label}</div>
            <div className="h-1 bg-[#1c2638] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: accent }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {analysis.mood.contributing_factors.map((f) => <span key={f} className="font-mono text-[9px] tracking-wider px-2 py-0.5 rounded-sm border border-[#2a3a55] text-[#5a6e8a]">{f}</span>)}
      </div>
      <p className="text-[10px] text-[#5a6e8a] leading-relaxed border-l-2 pl-2.5" style={{ borderColor: `${color}60` }}>{analysis.mood.rationale}</p>
    </div>
  );
}

// ─── Arousal / Valence ─────────────────────────

function ArousalValence({ summary, analysis }: { summary: ClipSummary; analysis: ClipAnalysis }) {
  const color = MOOD_COLORS[summary.mood_label] ?? "#5a6e8a";
  const S = 200;
  // map 0..1 to -50..+50 for display
  const valDisp = Math.round(analysis.prosody.valence * 100 - 50);
  const aroDisp = Math.round(analysis.prosody.arousal * 100 - 50);

  const cx = analysis.prosody.valence * S;
  const cy = (1 - analysis.prosody.arousal) * S;

  return (
    <div className="w-60 flex-shrink-0 rounded-[2px] border border-[#1c2638] bg-[#0b0f18] p-4 flex flex-col" style={CARBON}>
      <SectionLabel>Arousal / Valence</SectionLabel>
      <div className="flex-1 flex items-center justify-center">
        <svg width={S} height={S} className="overflow-visible">
          {[0.25, 0.5, 0.75].map((t) => (
            <g key={t}>
              <line x1={t * S} y1={0} x2={t * S} y2={S} stroke="#151f30" strokeWidth={1} />
              <line x1={0} y1={t * S} x2={S} y2={t * S} stroke="#151f30" strokeWidth={1} />
            </g>
          ))}
          <line x1={S / 2} y1={0} x2={S / 2} y2={S} stroke="#2a3a55" strokeWidth={1} />
          <line x1={0} y1={S / 2} x2={S} y2={S / 2} stroke="#2a3a55" strokeWidth={1} />
          <rect x={0} y={0} width={S} height={S} fill="none" stroke="#1c2638" strokeWidth={1} />
          <text x={S / 2 + 4} y={10} fill="#3a4e68" fontSize={7} fontFamily="JetBrains Mono">HIGH AROUSAL</text>
          <text x={S / 2 + 4} y={S - 3} fill="#3a4e68" fontSize={7} fontFamily="JetBrains Mono">LOW AROUSAL</text>
          <text x={3} y={S / 2 - 4} fill="#3a4e68" fontSize={7} fontFamily="JetBrains Mono">NEG</text>
          <text x={S - 20} y={S / 2 - 4} fill="#3a4e68" fontSize={7} fontFamily="JetBrains Mono">POS</text>
          <line x1={cx} y1={0} x2={cx} y2={S} stroke={`${color}30`} strokeWidth={0.5} strokeDasharray="3 3" />
          <line x1={0} y1={cy} x2={S} y2={cy} stroke={`${color}30`} strokeWidth={0.5} strokeDasharray="3 3" />
          <circle cx={cx} cy={cy} r={20} fill={`${color}08`} stroke={`${color}20`} strokeWidth={1} />
          <circle cx={cx} cy={cy} r={12} fill={`${color}15`} stroke={`${color}40`} strokeWidth={1} />
          <circle cx={cx} cy={cy} r={5} fill={color} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        {[{ label: "Valence", val: valDisp }, { label: "Arousal", val: aroDisp }].map(({ label, val }) => (
          <div key={label} className="bg-[#06080d] border border-[#1c2638] rounded-sm py-1.5">
            <div className="font-mono text-[16px] font-bold tabular-nums" style={{ color }}>{val > 0 ? "+" : ""}{val}</div>
            <div className="font-mono text-[8px] text-[#5a6e8a] tracking-widest uppercase">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Transcript ─────────────────────────

function Transcript({ words, progress }: { words: string[]; progress: number }) {
  const active = Math.floor(progress * words.length);
  return (
    <Panel>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Live Transcript</SectionLabel>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] animate-pulse" />
          <span className="font-mono text-[9px] text-[#5a6e8a] tracking-widest uppercase">Synced</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 leading-[2]">
        {words.map((word, i) => (
          <span key={i} className="font-mono text-[12px] px-1 rounded-sm transition-all duration-100"
            style={{
              color: i === active ? "#00d4ff" : i < active ? "#c4d4e8" : "#2d3d55",
              fontWeight: i === active ? 700 : i < active ? 400 : 300,
              background: i === active ? "rgba(0,212,255,0.1)" : "transparent",
              textShadow: i === active ? "0 0 10px #00d4ff" : "none",
              opacity: i > active ? 0.5 : 1,
            }}
          >{word}</span>
        ))}
      </div>
    </Panel>
  );
}

// ─── Lap Chart ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LapTip = ({ active, payload }: { active?: boolean; payload?: any }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as LapPoint;
  return (
    <div className="bg-[#080c14] border border-[#2a3a55] rounded-sm p-3 font-mono text-[10px] shadow-xl">
      <div className="text-[#00d4ff] font-bold tracking-wider mb-1.5">LAP {d.lap_number}</div>
      <div className="flex flex-col gap-1">
        {d.delta_s !== null && <div className="flex justify-between gap-6"><span className="text-[#5a6e8a]">Delta</span><span className="text-[#dce6f5] font-bold">{d.delta_s > 0 ? "+" : ""}{d.delta_s.toFixed(3)}s</span></div>}
        <div className="flex justify-between gap-6"><span className="text-[#5a6e8a]">Tyre</span><span style={{ color: TYRE_COLORS[d.compound || "Hard"] }} className="font-bold">⬤ {d.compound}</span></div>
        <div className="flex justify-between gap-6"><span className="text-[#5a6e8a]">Stint</span><span className="text-[#dce6f5]">{d.stint}</span></div>
        {d.is_radio_lap && <div className="mt-1 text-[#c84bff] border-t border-[#1c2638] pt-1">📡 RADIO EVENT</div>}
      </div>
    </div>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Dot = (props: { cx?: number; cy?: number; payload?: any }) => {
  const { cx, cy, payload } = props;
  if (!payload || cx == null) return null;
  const c = TYRE_COLORS[payload.compound] ?? "#fff";
  return (
    <g>
      {payload.is_radio_lap && <circle cx={cx} cy={cy} r={13} fill="none" stroke="#c84bff" strokeWidth={1} opacity={0.5} />}
      <circle cx={cx} cy={cy} r={payload.is_radio_lap ? 6 : 4} fill={c} opacity={0.9} style={{ filter: payload.is_radio_lap ? `drop-shadow(0 0 5px ${c})` : "none" }} />
    </g>
  );
};

function LapChart({ data }: { data: LapPoint[] }) {

  if (!data || data.length === 0) return <Panel><SectionLabel>Lap Performance</SectionLabel><div className="h-[200px] flex items-center justify-center text-xs text-[#5a6e8a]">No lap data</div></Panel>;

  return (
    <Panel>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Lap Performance · Δs by Lap</SectionLabel>
        <div className="flex gap-4">
          {Object.entries(TYRE_COLORS).slice(0, 3).map(([t, c]) => (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
              <span className="font-mono text-[9px] text-[#5a6e8a]">{t}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 border-l border-[#1c2638] pl-4">
            <div className="w-3 h-3 rounded-full border border-[#c84bff] bg-[#c84bff25]" />
            <span className="font-mono text-[9px] text-[#5a6e8a]">Radio</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 6, right: 16, bottom: 4, left: -4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#111a28" />
          <XAxis dataKey="lap_number" stroke="#1c2638" tick={{ fill: "#5a6e8a", fontSize: 10, fontFamily: "JetBrains Mono" }}>
            <Label value="LAP" position="insideBottomRight" offset={-4} fill="#3a4e68" fontSize={9} fontFamily="JetBrains Mono" />
          </XAxis>
          <YAxis stroke="#1c2638" tick={{ fill: "#5a6e8a", fontSize: 10, fontFamily: "JetBrains Mono" }}>
            <Label value="Δs" angle={-90} position="insideLeft" offset={8} fill="#3a4e68" fontSize={9} fontFamily="JetBrains Mono" />
          </YAxis>
          <ReferenceLine y={0} stroke="#2a3a55" strokeDasharray="4 4" />
          <RechartsTooltip content={<LapTip />} cursor={{ stroke: "#2a3a55", strokeWidth: 1 }} />
          <Line type="monotone" dataKey="delta_s" stroke="#00d4ff" strokeWidth={1.5} dot={<Dot />} activeDot={{ r: 7, fill: "#00d4ff" }} />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}

// ─── Correlation Plot ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Tip = ({ active, payload }: { active?: boolean; payload?: any }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#080c14] border border-[#2a3a55] rounded-sm p-2.5 font-mono text-[10px] shadow-xl">
      <div className="font-bold mb-1" style={{ color: MOOD_COLORS[d.mood_label] }}>{d.driver || "Unknown"}</div>
      <div className="text-[#dce6f5]">Stress: {Math.round(d.stress_index * 100)}</div>
      <div className="text-[#dce6f5]">Δ {d.delta_s > 0 ? "+" : ""}{d.delta_s.toFixed(2)}s</div>
      <div className="mt-1"><MoodPill mood={d.mood_label} small /></div>
    </div>
  );
};

function CorrelationPlot({ summary }: { summary: CorrelationSummary | null }) {

  if (!summary || !summary.points) return <Panel><SectionLabel>Stress Index ↔ Performance Correlation</SectionLabel><div className="h-[180px]" /></Panel>;

  return (
    <Panel>
      <SectionLabel>Stress Index ↔ Performance Correlation</SectionLabel>
      <ResponsiveContainer width="100%" height={180}>
        <ScatterChart margin={{ top: 6, right: 16, bottom: 4, left: -4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#111a28" />
          <XAxis dataKey="stress_index" type="number" domain={[0, 1]} stroke="#1c2638" tick={{ fill: "#5a6e8a", fontSize: 10, fontFamily: "JetBrains Mono" }} name="Stress Index">
            <Label value="STRESS INDEX" position="insideBottomRight" offset={-4} fill="#3a4e68" fontSize={9} fontFamily="JetBrains Mono" />
          </XAxis>
          <YAxis dataKey="delta_s" type="number" stroke="#1c2638" tick={{ fill: "#5a6e8a", fontSize: 10, fontFamily: "JetBrains Mono" }} name="Δs">
            <Label value="Δs" angle={-90} position="insideLeft" offset={8} fill="#3a4e68" fontSize={9} fontFamily="JetBrains Mono" />
          </YAxis>
          <ReferenceLine y={0} stroke="#2a3a55" strokeDasharray="4 4" />
          <RechartsTooltip content={<Tip />} cursor={{ strokeDasharray: "3 3", stroke: "#2a3a55" }} />
          <Scatter data={summary.points} isAnimationActive={false}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {summary.points.map((entry: any, i: number) => (
              <Cell key={i} fill={MOOD_COLORS[entry.mood_label] ?? "#5a6e8a"} opacity={0.88} style={{ filter: `drop-shadow(0 0 3px ${MOOD_COLORS[entry.mood_label]})` }} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p className="mt-2.5 font-mono text-[10px] text-[#5a6e8a] leading-relaxed border-l-2 border-[#e8002d40] pl-2.5">
        {summary.headline || "Correlation plot based on analyzed clips."}
      </p>
    </Panel>
  );
}

// ─── Upload Panel ─────────────────────────

type UploadState = "idle" | "dragging" | "uploading" | "done" | "error";

function UploadPanel({ onUploadComplete }: { onUploadComplete?: (result: ClipAnalysis) => void }) {
  const [state, setState] = useState<UploadState>("idle");
  const [fileName, setFileName] = useState("");
  const [pct, setPct] = useState(0);
  const [result, setResult] = useState<ClipAnalysis | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setFileName(file.name);
    setState("uploading");
    setPct(20);
    setError("");
    try {
      const res = await analyzeAudio(file, { driver: "Custom", race: "Testing", lap: 1 });
      setPct(100);
      setResult(res);
      setState("done");
      onUploadComplete?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try another file.");
      setState("error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) uploadFile(f); else setState("idle");
  };

  const circumference = 2 * Math.PI * 24;

  return (
    <Panel>
      <SectionLabel>Upload Audio Clip</SectionLabel>
      {(state === "idle" || state === "dragging") && (
        <div
          onDragOver={(e) => { e.preventDefault(); setState("dragging"); }}
          onDragLeave={() => setState("idle")}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed rounded-sm p-10 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200"
          style={{ borderColor: state === "dragging" ? "#e8002d" : "#2a3a55", background: state === "dragging" ? "rgba(232,0,45,0.05)" : "transparent" }}
        >
          <svg width="64" height="32" viewBox="0 0 64 32" fill="none">
            <path d="M4 20h2l3-6h42l3 6h4l3-4-4-6H8L4 16v4z" fill={state === "dragging" ? "#e8002d" : "#2a3a55"} />
            <path d="M16 14v-4l6-3h20l6 3v4" fill={state === "dragging" ? "#c84bff" : "#1c2638"} />
            <circle cx="14" cy="22" r="4" fill="#0b0f18" stroke={state === "dragging" ? "#e8002d" : "#2a3a55"} strokeWidth="1.5" />
            <circle cx="50" cy="22" r="4" fill="#0b0f18" stroke={state === "dragging" ? "#e8002d" : "#2a3a55"} strokeWidth="1.5" />
            <circle cx="14" cy="22" r="1.5" fill={state === "dragging" ? "#e8002d" : "#2a3a55"} />
            <circle cx="50" cy="22" r="1.5" fill={state === "dragging" ? "#e8002d" : "#2a3a55"} />
          </svg>
          <div className="text-center">
            <div className="font-display text-[11px] tracking-[0.2em] uppercase mb-1" style={{ color: state === "dragging" ? "#e8002d" : "#5a6e8a" }}>
              {state === "dragging" ? "Release to Analyze" : "Drag & Drop Audio"}
            </div>
            <div className="font-mono text-[9px] text-[#2d3d55]">MP3 · WAV · OGG · FLAC · M4A</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }} className="font-display text-[10px] tracking-[0.18em] uppercase px-5 py-2 rounded-sm border border-[#e8002d] text-[#e8002d] hover:bg-[#e8002d18] transition-colors">
            Browse Files
          </button>
          <input ref={inputRef} type="file" accept=".wav,.mp3,.m4a,.ogg,.flac,audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/flac" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.currentTarget.value = ""; }} />
        </div>
      )}
      {state === "uploading" && (
        <div className="py-8 flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <svg width="64" height="64" className="-rotate-90">
              <circle cx="32" cy="32" r="24" fill="none" stroke="#1c2638" strokeWidth="3" />
              <circle cx="32" cy="32" r="24" fill="none" stroke="#e8002d" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
                style={{ transition: "stroke-dashoffset 0.18s linear" }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-[12px] font-bold text-[#e8002d]">{pct}%</span>
          </div>
          <div className="text-center">
            <div className="font-mono text-[11px] text-[#dce6f5] mb-1">{fileName}</div>
            <div className="font-mono text-[9px] text-[#5a6e8a] animate-pulse">Running mood detection pipeline...</div>
          </div>
        </div>
      )}
      {state === "done" && result && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#00e67615] border border-[#00e676] flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5L8.5 2" stroke="#00e676" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <span className="font-mono text-[11px] text-[#00e676] font-bold tracking-wider">Analysis Complete</span>
          </div>
          <button onClick={() => { setState("idle"); setFileName(""); setPct(0); setResult(null); }} className="font-mono text-[9px] tracking-widest uppercase text-[#5a6e8a] hover:text-[#dce6f5] transition-colors self-start">
            ← Upload Another
          </button>
        </div>
      )}
      {state === "error" && (
        <div className="flex flex-col gap-3 border border-[#e8002d40] bg-[#e8002d08] p-4">
          <span className="font-mono text-[10px] font-bold tracking-wider text-[#e8002d]">Analysis Failed</span>
          <p className="font-mono text-[10px] leading-relaxed text-[#8fa0b8]">{error}</p>
          <button
            onClick={() => { setState("idle"); setFileName(""); setPct(0); setError(""); }}
            className="self-start border border-[#e8002d] px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-[#e8002d]"
          >
            Try Another File
          </button>
        </div>
      )}
    </Panel>
  );
}

// ─── Sidebar ─────────────────────────

function Sidebar({ clips, selected, onSelect }: { clips: ClipSummary[]; selected: string | null; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const moods = useMemo(() => ["All", "STRESSED", "CALM", "TIRED", "UNKNOWN"], []);

  const list = useMemo(() =>
    clips.filter((c) => {
      const ms = filter === "All" || c.mood_label === filter;
      const ss = !search || c.driver?.toLowerCase().includes(search.toLowerCase()) || c.transcript_preview.toLowerCase().includes(search.toLowerCase());
      return ms && ss;
    }), [clips, search, filter]);

  return (
    <aside className="w-[280px] flex-shrink-0 flex flex-col bg-[#08090e] border-r border-[#1c2638] overflow-hidden">
      <div className="px-4 pt-5 pb-4 border-b border-[#1c2638]">
        <div className="flex items-center gap-2.5 mb-4">
          <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
            <path d="M2 9h1.5l1.5-3h18l1.5 3H26l1.5-2-2-3.5H2.5L1 7v2z" fill="#e8002d" />
            <path d="M8 6V4.5L11 3h6l3 1.5V6" fill="#c84bff" opacity="0.7" />
            <circle cx="6" cy="11" r="2.5" fill="#0b0f18" stroke="#5a6e8a" strokeWidth="1" />
            <circle cx="22" cy="11" r="2.5" fill="#0b0f18" stroke="#5a6e8a" strokeWidth="1" />
            <circle cx="6" cy="11" r="1" fill="#5a6e8a" />
            <circle cx="22" cy="11" r="1" fill="#5a6e8a" />
          </svg>
          <div>
            <div className="font-display text-[11px] font-black tracking-[0.18em] text-[#dce6f5] uppercase">Silent Co-Driver</div>
            <div className="font-mono text-[8px] text-[#2d3d55] tracking-widest uppercase">Emotion Intelligence · F1</div>
          </div>
        </div>
        <div className="relative mb-2.5">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" width="11" height="11" viewBox="0 0 11 11" fill="none">
            <circle cx="4.5" cy="4.5" r="3.5" stroke="#2d3d55" strokeWidth="1.3" />
            <path d="M7.5 7.5l2 2" stroke="#2d3d55" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search drivers, clips..."
            className="w-full bg-[#06080d] border border-[#1c2638] rounded-sm pl-7 pr-3 py-1.5 font-mono text-[11px] text-[#dce6f5] placeholder-[#2d3d55] outline-none focus:border-[#e8002d40] transition-colors" />
        </div>
        <div className="flex flex-wrap gap-1">
          {moods.map((m) => {
            const c = MOOD_COLORS[m];
            const active = filter === m;
            return (
              <button key={m} onClick={() => setFilter(m)} className="font-mono text-[8px] tracking-wider px-1.5 py-0.5 rounded-sm border transition-all duration-150"
                style={{ borderColor: active ? (c ?? "#e8002d") : "#1c2638", color: active ? (c ?? "#e8002d") : "#3a4e68", background: active ? `${c ?? "#e8002d"}15` : "transparent" }}>
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <div className="px-4 py-8 text-center font-mono text-[10px] text-[#2d3d55]">No clips match</div>
        ) : list.map((clip) => {
          const color = MOOD_COLORS[clip.mood_label] ?? "#5a6e8a";
          const active = clip.clip_id === selected;
          return (
            <button key={clip.clip_id} onClick={() => onSelect(clip.clip_id)} className="w-full text-left px-4 py-3.5 border-b border-[#0f1218] hover:bg-[#0d1120] transition-colors"
              style={active ? { background: `linear-gradient(135deg,${color}0d,rgba(0,212,255,0.04))`, borderLeft: `2px solid ${color}`, paddingLeft: "14px" } : {}}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <div className="font-display text-[10px] font-bold tracking-wider text-[#dce6f5] uppercase truncate">{clip.driver || "Unknown"}</div>
                  <div className="font-mono text-[9px] text-[#3a4e68] truncate">{clip.race || "Track"}</div>
                </div>
                <DeltaBadge delta={clip.delta_s} />
              </div>
              <div className="flex items-center gap-1.5 mb-2">
                <MoodPill mood={clip.mood_label} small />
                <span className="font-mono text-[8px] text-[#2d3d55]">LAP {clip.lap}</span>
              </div>
              <p className="font-mono text-[9px] text-[#3a4e68] leading-relaxed line-clamp-2 italic">&quot;{clip.transcript_preview}&quot;</p>
              {active && (
                <div className="mt-2 flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    {[0, 1, 2, 3].map((b) => (
                      <div key={b} className="w-px h-2.5 rounded-full" style={{ background: color, animation: `wave-pulse ${0.5 + b * 0.15}s ease-in-out infinite alternate` }} />
                    ))}
                  </div>
                  <span className="font-mono text-[8px] tracking-widest uppercase" style={{ color }}>Active</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-[#1c2638] px-4 py-2.5 flex items-center justify-between">
        <span className="font-mono text-[8px] text-[#1c2638] tracking-widest uppercase">{list.length} / {clips.length} Clips</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00e676]" />
          <span className="font-mono text-[8px] text-[#1c2638] tracking-widest uppercase">Live</span>
        </div>
      </div>
    </aside>
  );
}

// ─── App Root ─────────────────────────

export default function Home() {
  const [clips, setClips] = useState<ClipSummary[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<ClipAnalysis | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationSummary | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchClips(), fetchCorrelation(), fetchHealth()])
      .then(([data, correlationData, healthData]) => {
        if (cancelled) return;
        setClips(data);
        setCorrelation(correlationData);
        setHealth(healthData);
        if (data.length > 0) setActiveClipId(data[0].clip_id);
        else setError("No analyzed clips are available.");
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load the demo data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!activeClipId) return;
    const uploadedAnalysis = activeClipId.startsWith("upload_") && activeAnalysis?.clip_id === activeClipId;
    if (uploadedAnalysis) return;
    fetchClip(activeClipId)
      .then((analysis) => { setActiveAnalysis(analysis); setError(null); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load the selected clip."));
    // Uploaded analyses are already held in state; dataset selections are fetched by id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipId]);

  const activeSummary = clips.find(c => c.clip_id === activeClipId);

  const handleUpload = (res: ClipAnalysis) => {
    const id = res.clip_id || `upload_${Date.now()}`;
    res.clip_id = id;
    const summary: ClipSummary = {
      clip_id: id, driver: res.driver, race: res.race, lap: res.lap,
      duration_s: res.prosody.duration_s, mood_label: res.mood.label,
      stress_index: res.mood.stress_index, delta_s: res.lap_context?.delta_s ?? null,
      transcript_preview: res.transcript.substring(0, 60), audio_url: res.audio_url
    };
    setClips(p => [summary, ...p]);
    setActiveAnalysis(res);
    setActiveClipId(id);
  };

  if (error) return (
    <div className="h-screen bg-[#06080d] flex items-center justify-center px-6 text-center font-mono">
      <div className="max-w-md border border-[#e8002d40] bg-[#0b0f18] p-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-[#e8002d]">Demo Data Unavailable</div>
        <p className="text-[11px] leading-relaxed text-[#8fa0b8]">{error}</p>
        <button onClick={() => window.location.reload()} className="mt-4 border border-[#e8002d] px-4 py-2 text-[9px] uppercase tracking-widest text-[#e8002d]">Retry</button>
      </div>
    </div>
  );
  if (loading || !activeSummary || !activeAnalysis || activeAnalysis.clip_id !== activeClipId) return <div className="h-screen bg-[#06080d] flex items-center justify-center text-[#5a6e8a] font-mono text-xs">Loading Pipeline...</div>;

  const color = MOOD_COLORS[activeSummary.mood_label] ?? "#e8002d";

  return (
    <div className="flex h-screen overflow-hidden bg-[#06080d] text-[#dce6f5]">
      <div className="scan-line" />
      <Sidebar clips={clips} selected={activeClipId} onSelect={setActiveClipId} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-[#08090e] border-b border-[#1c2638] px-6 py-2 flex items-center gap-4">
          <div className="flex gap-px mr-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-1 h-4 rounded-[1px]" style={{ background: i < 3 ? "#e8002d" : "#1c2638" }} />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${health?.mock_ml || activeAnalysis.mocked ? "bg-[#ff8c00]" : "bg-[#00e676] animate-pulse"}`} />
            <span className="font-mono text-[9px] tracking-widest text-[#5a6e8a] uppercase">
              {health?.mock_ml || activeAnalysis.mocked ? "Precomputed Fixture" : "Connected Analysis"}
            </span>
          </div>
          <div className="flex-1 h-px bg-[#1c2638]" />
          <div className="flex gap-5">
            {[
              { label: "Driver", value: activeSummary.driver?.split(" ").slice(-1)[0].toUpperCase() || "UNKNOWN" },
              { label: "Lap", value: `LAP ${activeSummary.lap || "?"}` },
              { label: "Mood", value: activeSummary.mood_label, c: color },
            ].map(({ label, value, c }) => (
              <div key={label} className="text-right">
                <div className="font-mono text-[12px] font-bold tabular-nums" style={{ color: c ?? "#dce6f5" }}>{value}</div>
                <div className="font-mono text-[8px] text-[#2d3d55] tracking-widest uppercase">{label}</div>
              </div>
            ))}
          </div>
          <div className="border border-[#00e676] px-2 py-0.5 rounded-sm">
            <span className="font-display text-[9px] tracking-widest text-[#00e676] uppercase">DRS ▶</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          <AudioPlayer key={activeAnalysis.clip_id} summary={activeSummary} analysis={activeAnalysis} onProgress={setAudioProgress} />
          <div className="flex gap-4">
            <MoodCard summary={activeSummary} analysis={activeAnalysis} />
            <ArousalValence summary={activeSummary} analysis={activeAnalysis} />
          </div>
          <Transcript words={activeAnalysis.words.map(w => w.word)} progress={audioProgress} />
          <LapChart data={activeAnalysis.lap_context?.window || []} />
          <CorrelationPlot summary={correlation} />
          <UploadPanel onUploadComplete={handleUpload} />
          <div className="h-2" />
        </main>
      </div>
    </div>
  );
}
