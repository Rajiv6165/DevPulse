import React from 'react'

export const SeverityBadge = ({ severity }) => {
  const norm = (severity || 'low').toLowerCase()
  
  let styles = 'bg-status-healthy/10 text-status-healthy border-status-healthy/20'
  if (norm === 'medium') {
    styles = 'bg-status-warning/10 text-status-warning border-status-warning/20'
  } else if (norm === 'critical') {
    styles = 'bg-status-critical/10 text-status-critical border-status-critical/20'
  }

  return (
    <span className={`px-2 py-0.5 rounded border text-[9px] font-mono font-semibold uppercase tracking-wider select-none ${styles}`}>
      {norm}
    </span>
  )
}

export default SeverityBadge
