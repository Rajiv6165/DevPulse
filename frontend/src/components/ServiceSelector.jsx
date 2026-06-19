import React from 'react'
import { useStore } from '../store/useStore'
import { Server } from 'lucide-react'

export const ServiceSelector = () => {
  const services = useStore((state) => state.services)
  const currentServiceId = useStore((state) => state.currentServiceId)
  const setCurrentServiceId = useStore((state) => state.setCurrentServiceId)

  return (
    <div className="flex items-center space-x-2 bg-white/3 border border-white/6 rounded px-2.5 py-1 text-xs text-neutral-300 hover:border-white/12 transition-all">
      <Server className="w-3.5 h-3.5 text-accent-cyan" />
      <select
        value={currentServiceId}
        onChange={(e) => setCurrentServiceId(e.target.value)}
        className="bg-transparent border-none outline-none cursor-pointer text-xs font-mono font-medium text-neutral-200"
      >
        <option value="all" className="bg-background text-neutral-300">ALL_SERVICES</option>
        {services.map((srv) => (
          <option key={srv.id} value={srv.id} className="bg-background text-neutral-300">
            {srv.name.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  )
}

export default ServiceSelector
