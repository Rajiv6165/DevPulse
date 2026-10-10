import React, { useEffect, useRef, memo, useState } from 'react'
import { useStore } from '../store/useStore'
import { Terminal, Play, Pause, Trash2 } from 'lucide-react'

// Memoized log line item to prevent unnecessary re-renders on new log updates
const LogLineItem = memo(({ log, getLogLevelStyle }) => {
  return (
    <div className="mb-0.5 py-0.5 border-b border-white/[0.01] flex items-start space-x-2.5 font-mono">
      <span className="text-neutral-600 select-none text-[10px] shrink-0">
        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
      </span>
      <span className={`px-1 py-0.2 rounded text-[8px] uppercase font-bold bg-white/3 select-none shrink-0 ${getLogLevelStyle(log.level)}`}>
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
  const clearLogs = useStore((state) => state.clearLogs)
  const consoleRef = useRef(null)
  const isAtBottom = useRef(true)

  const [isPaused, setIsPaused] = useState(false)
  const [displayedLogs, setDisplayedLogs] = useState([])
  const prevLenRef = useRef(0)

  // Track scroll position to pause auto-scrolling if the user scrolls up
  const handleScroll = () => {
    if (!consoleRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = consoleRef.current
    // User is at bottom if they are within 50px of the absolute bottom
    isAtBottom.current = Math.abs(scrollHeight - scrollTop - clientHeight) < 50
  }

  useEffect(() => {
    if (isPaused) return;
    
    const newDisplayed = logs.slice(-maxLines);
    
    // Auto-pause when hitting maxLines for the first time
    if (prevLenRef.current < maxLines && newDisplayed.length >= maxLines) {
      setIsPaused(true);
    }
    
    prevLenRef.current = newDisplayed.length;
    setDisplayedLogs(newDisplayed);
  }, [logs, isPaused, maxLines]);

  useEffect(() => {
    if (isAtBottom.current && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [displayedLogs])

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
    <div className="glass-card rounded overflow-hidden flex flex-col h-[300px] max-h-[300px] font-mono text-[11px] leading-relaxed border-white/6 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
      {/* Title Bar */}
      <div className="flex items-center justify-between bg-white/2 border-b border-white/6 px-4 py-2 select-none shrink-0">
        <div className="flex items-center space-x-2 text-neutral-400">
          <Terminal className="w-3.5 h-3.5 text-accent-cyan" />
          <span className="font-semibold tracking-wider text-[9px] text-neutral-300">{title}</span>
        </div>
        <div className="flex items-center space-x-3">
          {clearLogs && (
            <button 
              onClick={() => {
                clearLogs();
                prevLenRef.current = 0;
                setIsPaused(false);
              }}
              className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
              title="Clear Logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className={`${isPaused ? 'text-status-warning' : 'text-neutral-500 hover:text-white'} transition-colors cursor-pointer`}
            title={isPaused ? "Play" : "Pause"}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" fill="currentColor" /> : <Pause className="w-3.5 h-3.5" fill="currentColor" />}
          </button>

          <div className="flex items-center space-x-2 border-l border-white/10 pl-3">
            <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-status-warning' : 'bg-status-healthy animate-ping'}`} />
            <span className="text-[8px] text-neutral-500 tracking-widest uppercase">
              {isPaused ? 'PAUSED' : 'STREAMING'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Console Display */}
      <div className="relative flex-1 overflow-hidden">
        <div 
          ref={consoleRef}
          onScroll={handleScroll}
          className="p-4 h-full overflow-y-auto custom-scrollbar bg-black/45 font-mono text-left"
        >
          {displayedLogs.map((log) => (
            <LogLineItem 
              key={log.id || `${log.timestamp}-${log.message}`} 
              log={log} 
              getLogLevelStyle={getLogLevelStyle} 
            />
          ))}
        </div>
        
        {isPaused && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <button 
              onClick={() => setIsPaused(false)}
              className="bg-neutral-800/95 hover:bg-neutral-700 text-white text-[10px] font-mono px-4 py-2 rounded-full border border-white/10 shadow-lg backdrop-blur-sm transition-all cursor-pointer flex items-center space-x-2"
            >
              <Play className="w-3 h-3" fill="currentColor" />
              <span>PAUSED — scroll up to review | Click to resume</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default LiveTerminal
