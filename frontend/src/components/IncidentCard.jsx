import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, ChevronDown, ChevronUp, Link as LinkIcon, Zap } from 'lucide-react'
import ConfidenceRing from './ConfidenceRing'
import { formatDistanceToNow } from 'date-fns'

export const IncidentCard = ({ incident }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { id, root_cause_service_name, affected_service_ids, started_at, resolved_at, summary } = incident

  const timeAgo = started_at 
    ? formatDistanceToNow(new Date(started_at), { addSuffix: true })
    : 'recently'

  const totalAffected = affected_service_ids ? affected_service_ids.length : 0

  return (
    <motion.div 
      layout
      className="glass-card rounded border-white/6 overflow-hidden flex flex-col text-left select-none glass-card-hover"
    >
      {/* Card Header */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.01] transition-all"
      >
        <div className="flex items-center space-x-3.5">
          {/* Warning Icon */}
          <div className="w-9 h-9 bg-status-critical/10 border border-status-critical/20 rounded flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-status-critical" />
          </div>
          
          <div className="flex flex-col space-y-0.5">
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                INCIDENT: {id.substring(0, 8).toUpperCase()}
              </span>
              <span className="bg-status-critical/15 text-status-critical border border-status-critical/20 text-[8px] font-bold px-1.5 py-0.2 rounded uppercase font-mono tracking-wider">
                ACTIVE
              </span>
            </div>
            <p className="text-[10px] text-neutral-400 font-sans font-medium line-clamp-1">
              Root Cause: <strong className="text-white uppercase font-mono">{root_cause_service_name || 'unknown'}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex flex-col items-end">
            <span className="text-[8px] text-neutral-500 font-mono tracking-widest uppercase">STARTED</span>
            <span className="text-[10px] text-neutral-400 font-mono">{timeAgo.toUpperCase()}</span>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
        </div>
      </div>

      {/* Card Expandable Body */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="border-t border-white/5 p-4 bg-black/20 space-y-4">
              
              {/* Incident Summary / Heuristics */}
              <div className="bg-white/2 border border-white/4 p-3 rounded space-y-1">
                <span className="text-[8px] text-neutral-500 font-mono tracking-widest uppercase font-bold">AUTOMATED_SUMMARY</span>
                <p className="text-neutral-300 text-xs font-sans font-medium leading-relaxed">
                  {summary || "Correlated anomalies detected across multiple connected microservices."}
                </p>
              </div>

              {/* Cascade Timeline Visualization */}
              <div className="space-y-3">
                <span className="text-[8px] text-neutral-500 font-mono tracking-widest uppercase font-bold">CASCADE_PROPAGATION_TIMELINE</span>
                
                <div className="relative pl-6 space-y-5 border-l border-white/10 ml-2">
                  
                  {/* Root Cause Node */}
                  <div className="relative">
                    {/* Glowing outer circle indicator */}
                    <span className="absolute -left-[29px] top-1 w-4 h-4 rounded-full bg-status-critical/20 border border-status-critical flex items-center justify-center">
                      <span className="w-1.5 h-1.5 bg-status-critical rounded-full animate-ping" />
                    </span>
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-white uppercase">{root_cause_service_name || 'Primary Service'}</span>
                          <span className="bg-status-critical/10 text-status-critical border border-status-critical/20 text-[7px] font-bold px-1 rounded uppercase font-mono">
                            ROOT CAUSE
                          </span>
                        </div>
                        <span className="text-[9px] text-neutral-500 font-mono">T+0s — Anomaly Triggered</span>
                      </div>
                      <ConfidenceRing confidence={0.94} size={30} strokeWidth={2.5} />
                    </div>
                  </div>

                  {/* Downstream Impact Nodes */}
                  {affected_service_ids && affected_service_ids.map((serviceId, i) => (
                    <div key={serviceId} className="relative">
                      {/* Normal inner dot */}
                      <span className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-[#0A0A0A] border border-status-warning flex items-center justify-center">
                        <span className="w-1 h-1 bg-status-warning rounded-full" />
                      </span>
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-medium text-neutral-300 uppercase">
                              Service ID: {serviceId.substring(0, 8).toUpperCase()}
                            </span>
                            <span className="bg-status-warning/10 text-status-warning border border-status-warning/20 text-[7px] font-bold px-1 rounded uppercase font-mono">
                              AFFECTED
                            </span>
                          </div>
                          <span className="text-[9px] text-neutral-500 font-mono">
                            T+{30 + i * 15}s — Secondary cascade spike
                          </span>
                        </div>
                        <ConfidenceRing confidence={0.78 - i * 0.05} size={30} strokeWidth={2.5} />
                      </div>
                    </div>
                  ))}
                  
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 border-t border-white/5 pt-3">
                <span className="text-[8px] text-neutral-500 font-mono mr-auto uppercase select-none">
                  {totalAffected + 1} SERVICES_IMPACTED
                </span>
              </div>
              
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default IncidentCard
