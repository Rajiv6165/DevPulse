import React from 'react'

export const ConfidenceRing = ({ confidence = 0.0, size = 48, strokeWidth = 4 }) => {
  const normVal = Math.max(0.0, minVal(confidence)) // scale 0-1
  const percentage = Math.round(normVal * 100)
  
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - normVal * circumference

  function minVal(val) {
    if (val > 1.0) return 1.0
    return val
  }

  // Determine color based on confidence levels
  let strokeColor = 'text-accent-cyan'
  if (normVal > 0.85) {
    strokeColor = 'text-status-critical'
  } else if (normVal > 0.65) {
    strokeColor = 'text-status-warning'
  }

  return (
    <div className="relative flex items-center justify-center select-none" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-white/5"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress path */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={`transition-all duration-500 ease-out ${strokeColor}`}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
        />
      </svg>
      {/* Display text in center */}
      <span className="absolute font-mono text-[9px] font-bold text-white">
        {percentage}%
      </span>
    </div>
  )
}

export default ConfidenceRing
