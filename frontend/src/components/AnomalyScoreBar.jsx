import React from 'react'

export const AnomalyScoreBar = ({ score }) => {
  const num = parseFloat(score) || 0.0
  const capped = Math.max(0, Math.min(5, num))
  const percentage = (capped / 5) * 100

  let color = 'bg-status-healthy'
  if (num >= 3.5) {
    color = 'bg-status-critical shadow-[0_0_8px_#F43F5E]'
  } else if (num >= 2.5) {
    color = 'bg-status-warning shadow-[0_0_8px_#F59E0B]'
  }

  return (
    <div className="flex items-center space-x-2 w-full select-none">
      <div className="h-1.5 w-full bg-white/5 border border-white/5 rounded overflow-hidden">
        <div 
          className={`h-full rounded-sm transition-all duration-500 ${color}`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-neutral-400 min-w-[28px] text-right">
        {num.toFixed(2)}
      </span>
    </div>
  )
}

export default AnomalyScoreBar
