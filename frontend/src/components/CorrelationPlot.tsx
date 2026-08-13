// frontend/src/components/CorrelationPlot.tsx
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { CorrelationSummary } from '../lib/types';

interface CorrelationPlotProps {
  data: CorrelationSummary | null;
}

type ChartPoint = CorrelationPoint & { fill: string };

interface CorrelationTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}

function CustomTooltip({ active, payload }: CorrelationTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-gray-900 border border-gray-700 p-3 rounded-lg shadow-xl text-sm">
        <div className="font-bold text-white mb-1">{data.clip_id}</div>
        <div className="text-gray-400">Driver: <span className="text-white font-mono">{data.driver}</span></div>
        <div className="text-gray-400">Stress Index: <span className="text-white font-mono">{data.stress_index.toFixed(2)}</span></div>
        <div className="text-gray-400">Lap Delta: <span className={data.delta_s > 0 ? "text-red-400 font-mono" : "text-green-400 font-mono"}>{data.delta_s > 0 ? "+" : ""}{data.delta_s.toFixed(3)}s</span></div>
        <div className="text-gray-400 mt-1">Label: <span style={{ color: data.fill }} className="font-bold">{data.mood_label}</span></div>
      </div>
    );
  }
  return null;
}

export default function CorrelationPlot({ data }: CorrelationPlotProps) {
  if (!data || data.points.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50 h-full flex flex-col">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Stress vs Performance Correlation</h3>
        <div className="flex-1 flex items-center justify-center text-gray-500 italic text-sm">
          Not enough data to calculate correlation.
        </div>
      </div>
    );
  }

  const chartData: ChartPoint[] = data.points.map(p => ({
    ...p,
    // Add mood color mapping
    fill: p.mood_label === "STRESSED" ? "#ef4444" : 
          p.mood_label === "CALM" ? "#22c55e" : 
          p.mood_label === "TIRED" ? "#f59e0b" : "#6b7280"
  }));

  return (
    <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50 h-full flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider">Stress vs Performance Correlation</h3>
        {data.pearson_r !== null && (
          <div className="text-xs bg-blue-900/30 text-blue-400 border border-blue-500/30 px-2 py-1 rounded font-mono">
            r = {data.pearson_r.toFixed(2)} {data.p_value && data.p_value < 0.05 ? "(p<0.05)" : ""}
          </div>
        )}
      </div>
      
      <div className="flex-1 w-full min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              type="number" 
              dataKey="stress_index" 
              name="Stress Index" 
              domain={[0, 1]} 
              stroke="#9ca3af" 
              tick={{ fill: '#6b7280', fontSize: 12 }} 
              label={{ value: 'Stress Index', position: 'insideBottom', offset: -15, fill: '#9ca3af', fontSize: 12 }}
            />
            <YAxis 
              type="number" 
              dataKey="delta_s" 
              name="Lap Delta (s)" 
              stroke="#9ca3af" 
              tick={{ fill: '#6b7280', fontSize: 12 }} 
              tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}s`}
              label={{ value: 'Lap Delta vs Baseline', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3', stroke: '#4b5563' }} />
            <ReferenceLine y={0} stroke="#4b5563" />
            
            <Scatter name="Clips" data={chartData} fill="#8884d8">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 p-4 rounded-lg bg-black/40 border border-white/5">
        <p className="text-sm text-gray-300 leading-relaxed italic">
          &quot;{data.headline}&quot;
        </p>
      </div>
    </div>
  );
}
