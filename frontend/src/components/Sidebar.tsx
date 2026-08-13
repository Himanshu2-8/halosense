// frontend/src/components/Sidebar.tsx
import { ClipSummary } from "../lib/types";

interface SidebarProps {
  clips: ClipSummary[];
  activeClipId: string | null;
  onSelectClip: (id: string) => void;
  isLoading: boolean;
}

export default function Sidebar({ clips, activeClipId, onSelectClip, isLoading }: SidebarProps) {
  return (
    <div className="w-80 h-full border-r border-gray-800 bg-[#0a0a0f] flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-white mb-1 tracking-tight">Silent Co-Driver</h1>
        <p className="text-xs text-gray-500 uppercase tracking-wider">Radio Analysis Pipeline</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="p-4 text-center text-gray-500 text-sm">Loading clips...</div>
        ) : (
          clips.map((clip) => {
            const isActive = clip.clip_id === activeClipId;
            const isStressed = clip.mood_label === "STRESSED";
            const isCalm = clip.mood_label === "CALM";
            
            return (
              <div
                key={clip.clip_id}
                onClick={() => onSelectClip(clip.clip_id)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  isActive ? "bg-gray-800 border border-gray-700" : "hover:bg-gray-900 border border-transparent"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="font-mono text-xs text-gray-400">
                    {clip.driver || "UNK"} • {clip.lap ? `Lap ${clip.lap}` : "No Lap"}
                  </div>
                  <div className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    isStressed ? "bg-red-900/50 text-red-400 border border-red-500/30" : 
                    isCalm ? "bg-green-900/50 text-green-400 border border-green-500/30" : 
                    "bg-amber-900/50 text-amber-400 border border-amber-500/30"
                  }`}>
                    {clip.mood_label}
                  </div>
                </div>
                
                <div className="text-sm text-gray-300 line-clamp-2 leading-snug mb-2">
                  {clip.transcript_preview || "No transcript"}
                </div>
                
                <div className="flex justify-between items-center text-xs font-mono">
                  <div className="text-gray-500">{clip.duration_s.toFixed(1)}s</div>
                  {clip.delta_s !== null && (
                    <div className={clip.delta_s > 0 ? "text-red-400" : "text-green-400"}>
                      {clip.delta_s > 0 ? "+" : ""}{clip.delta_s.toFixed(3)}s
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
