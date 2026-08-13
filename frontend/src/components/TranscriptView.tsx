// frontend/src/components/TranscriptView.tsx
import { WordTiming } from "../lib/types";

interface TranscriptViewProps {
  words: WordTiming[];
  currentTime: number;
}

export default function TranscriptView({ words, currentTime }: TranscriptViewProps) {
  if (!words || words.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-4">Transcript</h3>
        <p className="text-gray-500 italic">No transcript available.</p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50 h-full">
      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-4">Transcript</h3>
      <div className="text-lg leading-relaxed space-x-1">
        {words.map((wordObj, i) => {
          const isPast = currentTime >= wordObj.end;
          const isCurrent = currentTime >= wordObj.start && currentTime < wordObj.end;
          
          let colorClass = "text-gray-500";
          if (isCurrent) colorClass = "text-white bg-white/10 rounded px-0.5";
          else if (isPast) colorClass = "text-gray-200";

          return (
            <span key={i} className={`transition-colors duration-100 ${colorClass}`}>
              {wordObj.word}
            </span>
          );
        })}
      </div>
    </div>
  );
}
