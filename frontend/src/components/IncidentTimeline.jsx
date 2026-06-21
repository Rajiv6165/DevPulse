import React from 'react'
import { motion } from 'framer-motion'
import { Clock, Activity, AlertOctagon } from 'lucide-react'

export const IncidentTimeline = ({ incidents = [], onSelectIncident, selectedIncidentId }) => {
  if (incidents.length === 0) {
    return (
      <div className="glass-card p-10 rounded text-center border-white/6 select-none">
        <AlertOctagon className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500 font-bold">
          NO_INCIDENTS_RECORDED
        </p>
      </div>
    )
  }

  // Find overall min and max bounds for timelines
  const now = new Date().getTime()
  const incidentTimes = incidents.map(i => new Date(i.started_at).getTime())
  const minTime = Math.min(...incidentTimes) - 10 * 60 * 1000 // padding 10m
  const maxTime = now + 5 * 60 * 1000 // padding 5m
  const totalRange = maxTime - minTime

  const getPositionPercentage = (timeStr) => {
    const timeVal = new Date(timeStr).getTime()
    return ((timeVal - minTime) / totalRange) * 100
  }

  const getWidthPercentage = (startStr, endStr) => {
    const startVal = new Date(startStr).getTime()
    const endVal = endStr ? new Date(endStr).getTime() : now
    return ((endVal - startVal) / totalRange) * 100
  }

  return (
    <div className="glass-card p-6 rounded border-white/6 flex flex-col text-left space-y-6 overflow-hidden select-none">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex flex-col space-y-0.5">
          <h2 className="text-xs font-semibold text-white uppercase tracking-widest">
            INCIDENT_SWIMLANES_CHART
          </h2>
          <p className="text-[8px] text-neutral-500 font-mono tracking-wider">
            CHRONOLOGICAL_PROPAGATION_TRAJECTORY
          </p>
        </div>
        <div className="flex items-center space-x-4 font-mono text-[8px] text-neutral-400">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded bg-status-critical" />
            <span>ROOT_CAUSE</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded bg-status-warning" />
            <span>CASCADE_AFFECTED</span>
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Timeline ruler */}
        <div className="relative h-6 border-b border-white/5 select-none">
          <div className="absolute left-0 text-[8px] font-mono text-neutral-600 uppercase">
            {new Date(minTime).toLocaleTimeString()}
          </div>
          <div className="absolute right-0 text-[8px] font-mono text-neutral-600 uppercase">
            NOW ({new Date().toLocaleTimeString()})
          </div>
        </div>

        {/* Incidents Swimlanes */}
        <div className="space-y-3.5">
          {incidents.map((inc) => {
            const isSelected = selectedIncidentId === inc.id
            const leftOffset = getPositionPercentage(inc.started_at)
            const barWidth = Math.max(8, getWidthPercentage(inc.started_at, inc.resolved_at))
            const isActive = !inc.resolved_at

            return (
              <div 
                key={inc.id}
                onClick={() => onSelectIncident(inc)}
                className={`grid grid-cols-1 md:grid-cols-12 gap-4 items-center py-2.5 px-3 rounded cursor-pointer transition-all border ${
                  isSelected 
                    ? 'bg-white/4 border-accent-cyan/35 shadow-[0_0_15px_rgba(0,245,255,0.02)]' 
                    : 'bg-black/15 border-white/3 hover:border-white/8 hover:bg-white/[0.01]'
                }`}
              >
                {/* Info Column */}
                <div className="md:col-span-3 text-left">
                  <span className="font-mono text-[9px] font-bold text-white uppercase block">
                    INCIDENT_{inc.id.substring(0, 6).toUpperCase()}
                  </span>
                  <span className="text-[10px] text-neutral-400 line-clamp-1 font-sans mt-0.5 uppercase font-semibold">
                    {inc.root_cause_service_name} degraded
                  </span>
                </div>

                {/* Swimlane Track Column */}
                <div className="md:col-span-9 relative h-10 w-full bg-white/[0.01] rounded border border-white/[0.02] flex items-center">
                  
                  {/* Grid overlay vertical tick */}
                  <div className="absolute left-1/4 h-full border-r border-white/[0.02] pointer-events-none" />
                  <div className="absolute left-1/2 h-full border-r border-white/[0.02] pointer-events-none" />
                  <div className="absolute left-3/4 h-full border-r border-white/[0.02] pointer-events-none" />

                  {/* Incident Duration Bar */}
                  <motion.div
                    layoutId={`inc-bar-${inc.id}`}
                    className={`absolute h-4 rounded-sm flex items-center px-1.5 cursor-pointer ${
                      isActive 
                        ? 'bg-status-critical/15 border border-status-critical/35 text-status-critical' 
                        : 'bg-neutral-600/10 border border-neutral-600/35 text-neutral-400'
                    }`}
                    style={{ left: `${leftOffset}%`, width: `${barWidth}%` }}
                  >
                    <span className="text-[7px] font-mono font-bold leading-none select-none">
                      {isActive ? 'ACTIVE' : 'RESOLVED'}
                    </span>
                  </motion.div>

                  {/* Root cause and Cascade dot markers along duration */}
                  <span 
                    className="absolute w-2 h-2 rounded-full bg-status-critical shadow-sm z-10 border border-black cursor-pointer"
                    style={{ left: `${leftOffset}%` }}
                    title={`Root Cause: ${inc.root_cause_service_name}`}
                  />
                  {inc.affected_service_ids && inc.affected_service_ids.map((_, index) => {
                    const delay = leftOffset + (barWidth / (inc.affected_service_ids.length + 1)) * (index + 1)
                    return (
                      <span
                        key={index}
                        className="absolute w-1.5 h-1.5 rounded-full bg-status-warning z-10 border border-black cursor-pointer"
                        style={{ left: `${Math.min(99.0, delay)}%` }}
                        title="Downstream failure cascade"
                      />
                    )
                  })}
                  
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default IncidentTimeline
