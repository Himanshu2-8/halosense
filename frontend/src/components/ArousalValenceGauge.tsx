// frontend/src/components/ArousalValenceGauge.tsx
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer } from 'recharts';

interface ArousalValenceGaugeProps {
  arousal: number;
  valence: number;
  quadrant: string;
}

export default function ArousalValenceGauge({ arousal, valence, quadrant }: ArousalValenceGaugeProps) {
  // We only show one point, the current clip's prosody
  const data = [{ x: valence, y: arousal }];
  
  // Choose color based on quadrant matching our MoodCard colors somewhat
  let dotColor = "#6b7280";
  if (quadrant === "HIGH_AROUSAL_NEGATIVE") dotColor = "#ef4444"; // Stressed
  else if (quadrant === "LOW_AROUSAL_NEGATIVE") dotColor = "#f59e0b"; // Tired
  else if (quadrant === "HIGH_AROUSAL_POSITIVE" || quadrant === "LOW_AROUSAL_POSITIVE") dotColor = "#22c55e"; // Calm
  
  return (
    <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50 h-full flex flex-col">
      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Russell Circumplex</h3>
      
      <div className="flex-1 w-full relative min-h-[200px]">
        {/* Quadrant labels */}
        <div className="absolute top-2 left-2 text-[10px] text-gray-500 font-mono tracking-tighter opacity-50 z-10">Stressed / Angry</div>
        <div className="absolute top-2 right-2 text-[10px] text-gray-500 font-mono tracking-tighter opacity-50 z-10">Elated / Pumped</div>
        <div className="absolute bottom-6 left-2 text-[10px] text-gray-500 font-mono tracking-tighter opacity-50 z-10">Tired / Depressed</div>
        <div className="absolute bottom-6 right-2 text-[10px] text-gray-500 font-mono tracking-tighter opacity-50 z-10">Calm / Content</div>
        
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis 
              type="number" 
              dataKey="x" 
              domain={[0, 1]} 
              tick={false} 
              axisLine={false} 
              label={{ value: 'Valence (Negative ↔ Positive)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 10 }}
            />
            <YAxis 
              type="number" 
              dataKey="y" 
              domain={[0, 1]} 
              tick={false} 
              axisLine={false}
              label={{ value: 'Arousal', angle: -90, position: 'insideLeft', offset: 25, fill: '#9ca3af', fontSize: 10 }}
            />
            
            {/* Crosshairs */}
            <ReferenceLine x={0.5} stroke="#4b5563" />
            <ReferenceLine y={0.5} stroke="#4b5563" />
            
            <Scatter data={data} fill={dotColor} shape="circle">
              {
                data.map((entry, index) => (
                  <circle key={`cell-${index}`} fill={dotColor} cx="0" cy="0" r="8" className="animate-pulse" />
                ))
              }
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="bg-gray-800/50 rounded px-2 py-1 text-center border border-gray-700/50">
          <div className="text-[10px] text-gray-500 uppercase">Valence</div>
          <div className="text-sm font-mono text-white">{valence.toFixed(2)}</div>
        </div>
        <div className="bg-gray-800/50 rounded px-2 py-1 text-center border border-gray-700/50">
          <div className="text-[10px] text-gray-500 uppercase">Arousal</div>
          <div className="text-sm font-mono text-white">{arousal.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}
