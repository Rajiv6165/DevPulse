import React, { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Terminal } from 'lucide-react'

export const LiveTerminal = ({ title = "LIVE_METRICS_STREAM", maxLines = 100 }) => {
  const logs = useStore((state) => state.logs)
  const terminalEndRef = useRef(null)

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

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
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar h-60 bg-black/45 font-mono text-left">
        {logs.slice(-maxLines).map((log, i) => (
          <div key={i} className="mb-0.5 py-0.5 border-b border-white/[0.01] flex items-start space-x-2.5 font-mono">
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
        ))}
        <div ref={terminalEndRef} />
      </div>
    </div>
  )
}

export default LiveTerminal
