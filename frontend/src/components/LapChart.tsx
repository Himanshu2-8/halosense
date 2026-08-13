// frontend/src/components/LapChart.tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { LapContext, LapPoint } from '../lib/types';

interface LapChartProps {
  lapContext: LapContext | null;
}

type ChartLapPoint = LapPoint & {
  delta: number;
  isRadio: boolean;
};

interface LapTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartLapPoint }>;
  label?: string | number;
}

function CustomTooltip({ active, payload, label }: LapTooltipProps) {
  if (active && payload && payload.length) {
    const p = payload[0].payload;
    return (
      <div className="bg-gray-900 border border-gray-700 p-3 rounded-lg shadow-xl text-sm">
        <div className="font-bold text-white mb-1">Lap {label}</div>
        <div className={p.delta > 0 ? "text-red-400" : "text-green-400"}>
          Delta: {p.delta > 0 ? "+" : ""}{p.delta.toFixed(3)}s
        </div>
        {p.lap_time_s && <div className="text-gray-400">Time: {p.lap_time_s.toFixed(3)}s</div>}
        <div className="text-gray-400 mt-1">Tyre: {p.compound} (L{p.tyre_life})</div>
        {p.isRadio && (
          <div className="mt-2 text-xs font-bold text-blue-400 uppercase">Radio Message</div>
        )}
      </div>
    );
  }
  return null;
}

export default function LapChart({ lapContext }: LapChartProps) {
  if (!lapContext || lapContext.window.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50 flex flex-col h-64">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Lap Time Context</h3>
        <div className="flex-1 flex items-center justify-center text-gray-500 italic text-sm">
          No lap context available for this clip.
        </div>
      </div>
    );
  }

  const data: ChartLapPoint[] = lapContext.window.filter((l): l is LapPoint & { delta_s: number } => l.delta_s !== null).map(l => ({
    ...l,
    delta: l.delta_s,
    // Add an explicit marker property for the radio lap so we can render a dot
    isRadio: l.lap_number === lapContext.lap_number
  }));

  const radioLap = data.find(d => d.isRadio);

  return (
    <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50 h-[300px] flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider">Lap Time Context</h3>
        {lapContext.trend === "DEGRADING" && <span className="text-xs text-red-400 font-bold bg-red-900/30 px-2 py-0.5 rounded">TREND: DEGRADING</span>}
        {lapContext.trend === "IMPROVING" && <span className="text-xs text-green-400 font-bold bg-green-900/30 px-2 py-0.5 rounded">TREND: IMPROVING</span>}
      </div>
      
      <div className="flex-1 w-full min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
            <XAxis dataKey="lap_number" stroke="#9ca3af" tick={{ fill: '#6b7280', fontSize: 12 }} />
            <YAxis stroke="#9ca3af" tick={{ fill: '#6b7280', fontSize: 12 }} tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}s`} />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              type="monotone" 
              dataKey="delta" 
              stroke="#60a5fa" 
              strokeWidth={3}
              dot={{ fill: '#1f2937', stroke: '#60a5fa', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: '#60a5fa' }}
            />
            {radioLap && radioLap.delta !== null && (
              <ReferenceDot 
                x={radioLap.lap_number} 
                y={radioLap.delta} 
                r={8} 
                fill="#ef4444" 
                stroke="#7f1d1d" 
                strokeWidth={2} 
                className="animate-pulse"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center text-[10px] text-gray-600 mt-2">
        Red dot = radio message | Lower is faster (vs baseline)
      </div>
    </div>
  );
}
