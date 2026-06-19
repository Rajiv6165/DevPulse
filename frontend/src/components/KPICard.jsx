import React from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export const KPICard = ({ 
  title, 
  value, 
  change, 
  isPositive, 
  data = [], 
  dataKey = "value", 
  unit = "" 
}) => {
  // Generate random fallback metrics data if none is populated yet
  const sparkData = data.length > 0 
    ? data 
    : Array.from({ length: 8 }, (_, i) => ({ value: 30 + Math.random() * 50 }))

  const strokeColor = isPositive ? '#10B981' : '#F43F5E'

  return (
    <div className="glass-card p-4.5 rounded flex items-center justify-between glass-card-hover select-none h-24">
      <div className="flex flex-col justify-between h-full space-y-1.5 text-left">
        <span className="text-[9px] uppercase tracking-widest text-neutral-400 font-semibold">
          {title}
        </span>
        <span className="font-mono text-2xl font-bold text-white tracking-tight">
          {value}{unit}
        </span>
        <div className="flex items-center space-x-1.5 leading-none">
          <span className={`text-[10px] font-bold ${isPositive ? 'text-status-healthy' : 'text-status-critical'}`}>
            {isPositive ? '↑' : '↓'} {change}%
          </span>
          <span className="text-[8px] text-neutral-500 font-medium">VS_PREV_HR</span>
        </div>
      </div>
      
      {/* Tiny Sparkline */}
      <div className="w-20 h-10 self-center">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={strokeColor}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default KPICard
