import React from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export const MetricChart = ({ 
  data = [], 
  dataKey = "value", 
  title = "Telemetry AreaChart", 
  color = "#00F5FF", 
  yUnit = "" 
}) => {
  // Scaffolding mock historical window if no metrics are received yet
  const chartData = data.length > 0 
    ? data 
    : Array.from({ length: 15 }, (_, i) => ({
        timestamp: new Date(Date.now() - (15 - i) * 10000),
        value: 25 + Math.random() * 45
      }))

  const formatXAxis = (tick) => {
    try {
      const date = new Date(tick)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch {
      return ''
    }
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      const timeStr = d.timestamp instanceof Date 
        ? d.timestamp.toLocaleTimeString() 
        : new Date(d.timestamp).toLocaleTimeString()
        
      return (
        <div className="bg-[#0A0A0A]/95 border border-white/8 px-3 py-2 rounded shadow-2xl font-mono text-[9px] text-left backdrop-blur-md">
          <p className="text-neutral-500 mb-0.5">{timeStr}</p>
          <p className="font-bold text-white uppercase">
            {title.replace('_', ' ')}: <span className="text-accent-cyan">{payload[0].value.toFixed(1)}{yUnit}</span>
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="glass-card p-4 rounded flex flex-col justify-between select-none h-64 border-white/6">
      <div className="flex items-center justify-between mb-3 text-left">
        <span className="font-mono text-[10px] font-bold text-neutral-300 uppercase tracking-widest">
          {title}
        </span>
        <span className="font-mono text-[8px] text-accent-cyan bg-accent-cyan/8 border border-accent-cyan/15 px-1.5 py-0.2 rounded uppercase">
          LIVE_FEED
        </span>
      </div>

      <div className="flex-1 w-full h-44 min-h-[170px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id={`grad-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.2}/>
                <stop offset="95%" stopColor={color} stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.015)" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxis} 
              stroke="rgba(255,255,255,0.08)"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: 'JetBrains Mono' }}
              dy={6}
            />
            <YAxis 
              stroke="rgba(255,255,255,0.08)"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: 'JetBrains Mono' }}
              dx={-6}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={1.2}
              fillOpacity={1} 
              fill={`url(#grad-${title.replace(/\s+/g, '')})`}
              isAnimationActive={true}
              animationDuration={400}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default MetricChart
