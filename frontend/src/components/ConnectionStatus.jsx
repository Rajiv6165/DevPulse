import React from 'react'
import { useStore } from '../store/useStore'

export const ConnectionStatus = () => {
  const wsConnected = useStore((state) => state.wsConnected)

  return (
    <div className="flex items-center space-x-2 bg-white/5 border border-white/8 rounded-full px-3 py-1 text-xs select-none">
      <span 
        className={`w-2 h-2 rounded-full transition-all duration-300 ${
          wsConnected 
            ? 'bg-status-healthy shadow-[0_0_10px_#10B981] animate-pulse' 
            : 'bg-neutral-500 shadow-[0_0_8px_#737373]'
        }`} 
      />
      <span className="font-mono text-[10px] tracking-wider text-neutral-400">
        {wsConnected ? 'WS_CONNECTED' : 'POLLING_FALLBACK'}
      </span>
    </div>
  )
}

export default ConnectionStatus
