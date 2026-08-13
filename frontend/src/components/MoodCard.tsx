// frontend/src/components/MoodCard.tsx
import { MoodVerdict } from "../lib/types";

export default function MoodCard({ mood }: { mood: MoodVerdict }) {
  const isStressed = mood.label === "STRESSED";
  const isCalm = mood.label === "CALM";
  const isTired = mood.label === "TIRED";

  let bgColor = "bg-gray-800";
  let textColor = "text-gray-300";
  let barColor = "bg-gray-500";

  if (isStressed) {
    bgColor = "bg-red-900/30 border-red-500/50";
    textColor = "text-red-400";
    barColor = "bg-red-500";
  } else if (isCalm) {
    bgColor = "bg-green-900/30 border-green-500/50";
    textColor = "text-green-400";
    barColor = "bg-green-500";
  } else if (isTired) {
    bgColor = "bg-amber-900/30 border-amber-500/50";
    textColor = "text-amber-400";
    barColor = "bg-amber-500";
  }

  return (
    <div className={`rounded-xl border ${bgColor} p-6 flex flex-col gap-4 shadow-lg`}>
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-1">Detected State</h2>
          <div className={`text-4xl font-bold tracking-tight ${textColor}`}>
            {mood.label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{(mood.confidence * 100).toFixed(0)}%</div>
          <div className="text-gray-400 text-xs">CONFIDENCE</div>
        </div>
      </div>

      <div className="w-full bg-gray-900 rounded-full h-1.5 mt-2">
        <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${mood.confidence * 100}%` }}></div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Stress Index</div>
          <div className="text-xl font-mono text-white">{mood.stress_index.toFixed(2)}</div>
        </div>
        <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Fatigue Index</div>
          <div className="text-xl font-mono text-white">{mood.fatigue_index.toFixed(2)}</div>
        </div>
      </div>

      {mood.contributing_factors.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Contributing Signals</h3>
          <div className="flex flex-wrap gap-2">
            {mood.contributing_factors.map((factor, i) => (
              <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-gray-800 text-gray-300 border border-gray-700 font-medium">
                {factor.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 p-4 rounded-lg bg-black/40 border border-white/5">
        <p className="text-sm text-gray-300 leading-relaxed italic">
          &quot;{mood.rationale}&quot;
        </p>
      </div>
    </div>
  );
}
