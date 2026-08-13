// frontend/src/components/AudioPlayer.tsx
import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

interface AudioPlayerProps {
  url: string;
  onTimeUpdate?: (time: number) => void;
}

export default function AudioPlayer({ url, onTimeUpdate }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4b5563",
      progressColor: "#3b82f6",
      cursorColor: "#ffffff",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 64,
      normalize: true,
    });

    wavesurferRef.current = ws;

    ws.on("ready", () => {
      setIsReady(true);
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));
    
    ws.on("audioprocess", (time) => {
      if (onTimeUpdate) onTimeUpdate(time);
    });
    
    ws.on("seeking", () => {
      if (onTimeUpdate) onTimeUpdate(ws.getCurrentTime());
    });

    return () => {
      ws.destroy();
    };
  }, [onTimeUpdate]);

  // Load URL when it changes
  useEffect(() => {
    if (wavesurferRef.current && url) {
      setIsReady(false);
      setIsPlaying(false);
      setAudioUnavailable(false);
      
      // In mock mode or no url, handle gracefully
      if (url === "") {
        wavesurferRef.current.empty();
        return;
      }
      
      wavesurferRef.current.load(url).catch((err) => {
        if (err.name !== "AbortError") {
          // Silently mark as unavailable instead of logging to console
          setAudioUnavailable(true);
        }
      });
    }
  }, [url]);

  const togglePlay = () => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.playPause();
    }
  };

  return (
    <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
      <div className="flex items-center gap-4">
        <button
          onClick={togglePlay}
          disabled={!isReady || url === ""}
          className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors ${
            !isReady || url === "" 
              ? "bg-gray-800 text-gray-500 cursor-not-allowed" 
              : "bg-blue-600 text-white hover:bg-blue-500"
          }`}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
          ) : (
            <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <div className="flex-1 overflow-hidden" ref={containerRef}></div>
      </div>
      {(url === "" || audioUnavailable) && (
        <div className="text-center text-xs text-yellow-500/70 mt-2">
          {audioUnavailable
            ? "Audio file not found — place .wav in data/clips/ to enable playback"
            : "Audio playback disabled in mock mode"}
        </div>
      )}
    </div>
  );
}
