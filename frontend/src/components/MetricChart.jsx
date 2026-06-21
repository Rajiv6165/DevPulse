import React from 'react'
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

export const MetricChart = ({ 
  data = [], 
  forecastData = [],
  title = "Telemetry AreaChart", 
  color = "#00F5FF", 
  yUnit = "" 
}) => {
  // Scaffolding mock historical window if no metrics are received yet
  const historicalData = data.length > 0 
    ? data 
    : Array.from({ length: 15 }, (_, i) => ({
        timestamp: new Date(Date.now() - (15 - i) * 60000).toISOString(),
        value: 25 + Math.random() * 45
      }))

  // Construct combined dataset for Recharts
  const mergedData = []
  
  // 1. Process historical data
  historicalData.forEach(d => {
    const timeVal = new Date(d.timestamp).getTime()
    mergedData.push({
      timestamp: timeVal,
      displayTime: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      historical: parseFloat(d.value || d.v || 0.0),
      forecast: null
    })
  })

  // 2. Connect and process forecast data
  const nowTimestamp = mergedData.length > 0 ? mergedData[mergedData.length - 1].timestamp : null
  const connectedForecast = [...forecastData]

  if (mergedData.length > 0 && connectedForecast.length > 0) {
    // Connect the last historical point with the first forecast point
    mergedData[mergedData.length - 1].forecast = mergedData[mergedData.length - 1].historical

    connectedForecast.forEach(f => {
      const timeVal = new Date(f.timestamp).getTime()
      // Skip if somehow before the end of history
      if (timeVal > nowTimestamp) {
        mergedData.push({
          timestamp: timeVal,
          displayTime: new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          historical: null,
          forecast: parseFloat(f.value || 0.0)
        })
      }
    })
  }

  const formatXAxis = (tick) => {
    try {
      const date = new Date(tick)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      const timeStr = new Date(d.timestamp).toLocaleTimeString()
      const isForecast = d.historical === null
      
      return (
        <div className="bg-[#0A0A0A]/95 border border-white/8 px-3 py-2 rounded shadow-2xl font-mono text-[9px] text-left backdrop-blur-md">
          <p className="text-neutral-500 mb-0.5">{timeStr} {isForecast ? '(FORECAST)' : '(REAL-TIME)'}</p>
          {d.historical !== null && (
            <p className="font-bold text-white uppercase">
              ACTUAL: <span className="text-accent-cyan">{d.historical.toFixed(1)}{yUnit}</span>
            </p>
          )}
          {d.forecast !== null && (
            <p className="font-bold text-white uppercase">
              PREDICTED: <span className="text-violet-400">{d.forecast.toFixed(1)}{yUnit}</span>
            </p>
          )}
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
          <AreaChart data={mergedData} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
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
              type="number"
              domain={['dataMin', 'dataMax']}
            />
            <YAxis 
              stroke="rgba(255,255,255,0.08)"
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: 'JetBrains Mono' }}
              dx={-6}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Draw a vertical marker for "NOW" separating actual from predicted */}
            {nowTimestamp && (
              <ReferenceLine 
                x={nowTimestamp} 
                stroke="#A78BFA" 
                strokeDasharray="4 4"
                label={{ value: "NOW", fill: "#A78BFA", fontSize: 7, position: "top", fontFamily: "JetBrains Mono" }} 
              />
            )}

            {/* Real-time actual line & gradient area */}
            <Area 
              type="monotone" 
              dataKey="historical" 
              stroke={color} 
              strokeWidth={1.2}
              fillOpacity={1} 
              fill={`url(#grad-${title.replace(/\s+/g, '')})`}
              isAnimationActive={true}
              animationDuration={400}
              connectNulls={false}
            />

            {/* Forecast violet dashed line */}
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#A78BFA"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={true}
              connectNulls={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default MetricChart

