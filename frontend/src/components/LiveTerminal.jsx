import React, { useEffect, useRef, memo } from 'react'
import { useStore } from '../store/useStore'
import { Terminal } from 'lucide-react'

// Memoized log line item to prevent unnecessary re-renders on new log updates
const LogLineItem = memo(({ log, getLogLevelStyle }) => {
  return (
    <div className="mb-0.5 py-0.5 border-b border-white/[0.01] flex items-start space-x-2.5 font-mono">
      <span className="text-neutral-600 select-none text-[10px]">
        {log.timestamp ? log.timestamp.toLocaleTimeString() : ''}
      </span>
      <span className={`px-1 py-0.2 rounded text-[8px] uppercase font-bold bg-white/3 select-none ${getLogLevelStyle(log.level)}`}>
        {log.level}
      </span>
      <span className="text-neutral-200 break-all select-all font-mono">
        {log.message}
      </span>
    </div>
  )
})

LogLineItem.displayName = 'LogLineItem'

export const LiveTerminal = ({ title = "LIVE_METRICS_STREAM", maxLines = 50 }) => {
  const logs = useStore((state) => state.logs)
  const consoleRef = useRef(null)
  const isAtBottom = useRef(true)

  // Track scroll position to pause auto-scrolling if the user scrolls up
  const handleScroll = () => {
    if (!consoleRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = consoleRef.current
    // User is at bottom if they are within 50px of the absolute bottom
    isAtBottom.current = scrollHeight - scrollTop - clientHeight < 50
  }

  useEffect(() => {
    if (isAtBottom.current && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [logs])

  // Initial scroll to bottom on mount
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [])

  const getLogLevelStyle = (level) => {
    const norm = (level || 'INFO').toUpperCase()
    if (norm === 'ERROR') return 'text-status-critical font-bold'
    if (norm === 'WARN') return 'text-status-warning'
    if (norm === 'DEBUG') return 'text-neutral-500'
    return 'text-accent-cyan'
  }

  return (
    <div className="glass-card rounded overflow-hidden flex flex-col h-full font-mono text-[11px] leading-relaxed border-white/6 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
      {/* Title Bar */}
      <div className="flex items-center justify-between bg-white/2 border-b border-white/6 px-4 py-2 select-none">
        <div className="flex items-center space-x-2 text-neutral-400">
          <Terminal className="w-3.5 h-3.5 text-accent-cyan" />
          <span className="font-semibold tracking-wider text-[9px] text-neutral-300">{title}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-1.5 h-1.5 bg-status-healthy rounded-full animate-ping" />
          <span className="text-[8px] text-neutral-500 tracking-widest uppercase">STREAMING</span>
        </div>
      </div>
      
      {/* Console Display */}
      <div 
        ref={consoleRef}
        onScroll={handleScroll}
        className="p-4 flex-1 overflow-y-auto custom-scrollbar h-60 bg-black/45 font-mono text-left"
      >
        {logs.slice(-maxLines).map((log) => (
          <LogLineItem 
            key={log.id || `${log.timestamp}-${log.message}`} 
            log={log} 
            getLogLevelStyle={getLogLevelStyle} 
          />
        ))}
      </div>
    </div>
  )
}

export default LiveTerminal
