import React from 'react'
import { Link } from 'react-router-dom'

export const ServiceHealthCard = ({ 
  id, 
  name, 
  score = 100, 
  is_active = true, 
  lastSeen 
}) => {
  const normScore = Math.max(0, Math.min(100, Math.round(score)))
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (normScore / 100) * circumference

  // Select color styles based on health scores
  let colorClass = 'text-status-healthy'
  let dotClass = 'bg-status-healthy shadow-[#10B981]'
  
  if (normScore < 60) {
    colorClass = 'text-status-critical'
    dotClass = 'bg-status-critical shadow-[#F43F5E] animate-pulse-glow shadow-md'
  } else if (normScore < 85) {
    colorClass = 'text-status-warning'
    dotClass = 'bg-status-warning shadow-[#F59E0B] animate-pulse'
  }

  const timeStr = lastSeen ? new Date(lastSeen).toLocaleTimeString() : 'ACTIVE'

  return (
    <Link 
      to={`/services/${id}`}
      title={`Click to view details for ${name}`}
      className="glass-card p-3 rounded flex items-center justify-between glass-card-hover select-none border-white/6"
    >
      <div className="flex items-center space-x-3 text-left">
        {/* Pulsing Status Dot */}
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        
        <div className="flex flex-col space-y-0.5">
          <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
            {name}
          </span>
          <span className="text-[9px] text-neutral-500 font-mono tracking-tight">
            UP: {timeStr}
          </span>
        </div>
      </div>
      
      {/* circular SVG health ring */}
      <div className="relative flex items-center justify-center w-10 h-10">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="20"
            cy="20"
            r={radius}
            className="stroke-white/5"
            strokeWidth="3"
            fill="transparent"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            className={`transition-all duration-1000 ${colorClass}`}
            strokeWidth="3"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
          />
        </svg>
        <span className="absolute font-mono text-[9px] font-bold text-white">
          {normScore}%
        </span>
      </div>
    </Link>
  )
}

export default ServiceHealthCard
