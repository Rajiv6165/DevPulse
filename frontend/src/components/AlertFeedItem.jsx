import React from 'react'
import { motion } from 'framer-motion'
import { Check, AlertCircle } from 'lucide-react'
import SeverityBadge from './SeverityBadge'
import { formatDistanceToNow } from 'date-fns'

export const AlertFeedItem = ({ 
  id, 
  message, 
  severity, 
  created_at, 
  is_resolved, 
  onResolve 
}) => {
  const timeAgo = created_at 
    ? formatDistanceToNow(new Date(created_at), { addSuffix: true }) 
    : 'just now'

  // Severity color indicator border
  let borderClass = 'border-l-status-healthy'
  let textClass = 'text-status-healthy'
  if (severity === 'critical') {
    borderClass = 'border-l-status-critical'
    textClass = 'text-status-critical'
  } else if (severity === 'medium') {
    borderClass = 'border-l-status-warning'
    textClass = 'text-status-warning'
  }

  return (
    <motion.div
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -80, opacity: 0 }}
      layout
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`glass-card border border-white/6 border-l-4 p-3.5 rounded flex flex-col space-y-2 text-left relative overflow-hidden ${borderClass}`}
    >
      <div className="flex items-start justify-between space-x-2">
        <div className="flex items-center space-x-1.5">
          <AlertCircle className={`w-3.5 h-3.5 ${textClass}`} />
          <SeverityBadge severity={severity} />
        </div>
        <span className="text-[9px] text-neutral-500 font-mono">
          {timeAgo.toUpperCase()}
        </span>
      </div>

      <p className="text-neutral-200 text-[11px] font-sans font-medium leading-relaxed">
        {message}
      </p>

      {!is_resolved && (
        <button
          onClick={() => onResolve(id)}
          className="self-end flex items-center space-x-1.5 px-2 py-0.8 bg-white/4 border border-white/6 rounded text-[9px] font-mono font-bold text-neutral-300 hover:text-accent-cyan hover:border-accent-cyan/35 hover:bg-accent-cyan/5 transition-all uppercase select-none cursor-pointer"
        >
          <Check className="w-3 h-3 text-status-healthy" />
          <span>RESOLVE</span>
        </button>
      )}
    </motion.div>
  )
}

export default AlertFeedItem
