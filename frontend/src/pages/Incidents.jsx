import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Clock, ShieldCheck, ArrowRight, X, Activity, RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useNavigate } from 'react-router-dom'
import ConnectionStatus from '../components/ConnectionStatus'
import IncidentTimeline from '../components/IncidentTimeline'
import ConfidenceRing from '../components/ConfidenceRing'

export const Incidents = () => {
  const navigate = useNavigate()
  const token = useStore((state) => state.token)
  const incidents = useStore((state) => state.incidents)
  const setIncidents = useStore((state) => state.setIncidents)
  const [filterActive, setFilterActive] = useState('all') // 'all' | 'active' | 'resolved'
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [timelineDetails, setTimelineDetails] = useState(null)
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(false)

  // Redirect if unauthenticated
  useEffect(() => {
    if (!token) {
      navigate('/login')
    }
  }, [token, navigate])

  // Load incidents from backend
  const fetchIncidents = () => {
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      let url = '/api/incidents/'
      if (filterActive === 'active') url += '?active=true'
      else if (filterActive === 'resolved') url += '?active=false'

      fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setIncidents(data)
        }
      }).catch(err => console.warn('Could not load incidents:', err))
    }
  }

  useEffect(() => {
    fetchIncidents()
  }, [token, filterActive])

  // Fetch incident timeline details
  useEffect(() => {
    if (selectedIncident) {
      setIsLoadingTimeline(true)
      if (token && token !== 'demo_jwt_token_key_devpulse') {
        fetch(`/api/incidents/${selectedIncident.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          setTimelineDetails(data)
        })
        .catch(err => {
          console.warn('Could not load timeline details:', err)
          setTimelineDetails(null)
        })
        .finally(() => {
          setIsLoadingTimeline(false)
        })
      } else {
        // Mock timeline details for demo mode
        setTimeout(() => {
          const mockAnomalies = [
            {
              anomaly_id: 'anom-1',
              service_id: selectedIncident.root_cause_service_id,
              service_name: selectedIncident.root_cause_service_name,
              metric_type: 'cpu',
              score: 0.94,
              detected_at: selectedIncident.started_at,
              explanation: `CPU hit 94%, which is 3.2x higher than typical 29% seen at this hour. Matches load spike.`
            }
          ]
          
          if (selectedIncident.affected_service_ids) {
            selectedIncident.affected_service_ids.forEach((sid, idx) => {
              mockAnomalies.push({
                anomaly_id: `anom-aff-${idx}`,
                service_id: sid,
                service_name: `downstream-service-${idx + 1}`,
                metric_type: idx % 2 === 0 ? 'error_rate' : 'response_time',
                score: 0.78 - idx * 0.08,
                detected_at: new Date(new Date(selectedIncident.started_at).getTime() + (idx + 1) * 30000).toISOString(),
                explanation: `${idx % 2 === 0 ? 'Error rate' : 'Response time'} spiked to ${idx % 2 === 0 ? '6.8%' : '450ms'} due to downstream request bottlenecks.`
              })
            })
          }

          setTimelineDetails({
            ...selectedIncident,
            timeline: mockAnomalies
          })
          setIsLoadingTimeline(false)
        }, 400)
      }
    } else {
      setTimelineDetails(null)
    }
  }, [selectedIncident, token])

  // Filter local store incidents for display
  const getFilteredIncidents = () => {
    return incidents.filter(inc => {
      if (filterActive === 'active') return !inc.resolved_at
      if (filterActive === 'resolved') return inc.resolved_at
      return true
    })
  }

  const displayedIncidents = getFilteredIncidents()

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 space-y-6 select-none relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,245,255,0.015),transparent)] pointer-events-none" />

      {/* NAVBAR */}
      <nav className="glass-card rounded px-4 py-3 flex items-center justify-between border-white/6 select-none relative z-10">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <div className="w-8 h-8 bg-accent-cyan/10 border border-accent-cyan/20 rounded flex items-center justify-center">
            <Activity className="w-4 h-4 text-accent-cyan" />
          </div>
          <span className="font-mono text-base font-bold text-white tracking-widest uppercase">
            DEV<span className="text-accent-cyan">PULSE</span>
          </span>
        </div>

        <div className="flex items-center space-x-6 font-mono text-xs">
          <button onClick={() => navigate('/dashboard')} className="text-neutral-400 hover:text-white transition-all uppercase tracking-wider">Dashboard</button>
          <button onClick={() => navigate('/services')} className="text-neutral-400 hover:text-white transition-all uppercase tracking-wider">Services</button>
          <button onClick={() => navigate('/incidents')} className="text-white border-b border-accent-cyan pb-1 transition-all uppercase tracking-wider">Incidents</button>
          <button onClick={() => navigate('/alerts')} className="text-neutral-400 hover:text-white transition-all uppercase tracking-wider">Alerts</button>
          <ConnectionStatus />
        </div>
      </nav>

      {/* FILTER HEADER */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 select-none relative z-10">
        <div className="flex flex-col space-y-1 text-left">
          <h1 className="text-base font-bold text-white uppercase tracking-widest font-mono">
            Incidents Center
          </h1>
          <p className="text-[10px] text-neutral-500 font-mono tracking-wider">
            MULTI_SERVICE_DEGRADATION_TIMELINE_TRACKER
          </p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Refresh Button */}
          <button 
            onClick={fetchIncidents}
            className="p-1.5 bg-white/3 border border-white/6 hover:border-accent-cyan/35 hover:text-accent-cyan rounded transition-all cursor-pointer text-neutral-400"
            title="Refresh Incidents"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Filters */}
          <div className="flex items-center bg-white/3 border border-white/6 rounded p-1 text-[10px] font-mono">
            {['all', 'active', 'resolved'].map((filter) => (
              <button
                key={filter}
                onClick={() => {
                  setFilterActive(filter)
                  setSelectedIncident(null)
                }}
                className={`px-3 py-1 rounded-sm font-bold uppercase transition-all tracking-wider cursor-pointer ${
                  filterActive === filter 
                    ? 'bg-accent-cyan text-black font-semibold' 
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT SPLIT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative z-10 flex-1">
        
        {/* LEFT CHART SWIMLANES */}
        <div className="lg:col-span-8 flex flex-col space-y-6 h-full">
          <IncidentTimeline 
            incidents={displayedIncidents} 
            onSelectIncident={(inc) => setSelectedIncident(inc)}
            selectedIncidentId={selectedIncident?.id}
          />
        </div>

        {/* RIGHT TIMELINE SIDE PANEL DRAWER */}
        <div className="lg:col-span-4 h-full flex flex-col">
          <AnimatePresence mode="wait">
            {selectedIncident ? (
              <motion.div
                key={selectedIncident.id}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                className="glass-card p-5 rounded border-white/6 flex flex-col text-left space-y-5 h-full relative"
              >
                {/* Header info */}
                <div className="flex items-start justify-between border-b border-white/5 pb-3">
                  <div className="flex flex-col space-y-0.5">
                    <span className="font-mono text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                      INCIDENT_TIMELINE_DETAILS
                    </span>
                    <h3 className="font-mono text-sm font-bold text-white uppercase mt-1">
                      INCIDENT_{selectedIncident.id.substring(0, 8).toUpperCase()}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setSelectedIncident(null)}
                    className="p-1 hover:bg-white/5 hover:text-white text-neutral-500 rounded transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {isLoadingTimeline ? (
                  <div className="py-20 flex flex-col items-center justify-center space-y-2 select-none">
                    <div className="w-5 h-5 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                    <span className="font-mono text-[8px] text-neutral-500 tracking-widest">LOADING_TIMELINE</span>
                  </div>
                ) : timelineDetails ? (
                  <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar pr-1">
                    
                    {/* Summary box */}
                    <div className="bg-white/2 border border-white/4 p-3 rounded">
                      <span className="text-[8px] font-mono text-neutral-500 tracking-widest block font-bold uppercase mb-1">DETECTION_SUMMARY</span>
                      <p className="text-neutral-300 text-xs font-sans font-medium leading-relaxed">
                        {timelineDetails.summary}
                      </p>
                    </div>

                    {/* Timeline events */}
                    <div className="space-y-4">
                      <span className="text-[8px] font-mono text-neutral-500 tracking-widest block font-bold uppercase select-none">CHRONOLOGICAL_PROPAGATION_LOG</span>
                      
                      <div className="relative pl-6 space-y-5 border-l border-white/5 ml-2.5">
                        
                        {timelineDetails.timeline && timelineDetails.timeline.map((event, index) => {
                          const isRoot = index === 0
                          const timeStr = new Date(event.detected_at).toLocaleTimeString()
                          
                          return (
                            <div key={event.anomaly_id} className="relative group">
                              {/* Connector marker */}
                              <span className={`absolute -left-[30px] top-1.5 w-3 h-3 rounded-full border border-black flex items-center justify-center ${
                                isRoot ? 'bg-status-critical shadow-md shadow-status-critical/15' : 'bg-status-warning'
                              }`} />

                              <div className="flex items-start justify-between space-x-2">
                                <div className="flex flex-col space-y-0.5 text-left">
                                  <div className="flex items-center space-x-1.5 flex-wrap">
                                    <span className="font-mono text-xs font-bold text-white uppercase">{event.service_name}</span>
                                    <span className="text-[8px] text-neutral-500 font-mono">({event.metric_type.toUpperCase()})</span>
                                    {isRoot && (
                                      <span className="bg-status-critical/10 text-status-critical border border-status-critical/20 text-[6px] font-bold px-1 rounded uppercase font-mono">
                                        ROOT_CAUSE
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-neutral-500 font-mono">{timeStr} — confidence score</span>
                                  <p className="text-neutral-400 text-[11px] font-sans font-medium mt-1 leading-relaxed">
                                    {event.explanation}
                                  </p>
                                </div>
                                <ConfidenceRing confidence={event.score} size={28} strokeWidth={2} />
                              </div>
                            </div>
                          )
                        })}

                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="py-20 text-center select-none">
                    <span className="font-mono text-[9px] text-neutral-600 tracking-wider">TIMELINE_FAILED_TO_LOAD</span>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="glass-card p-10 rounded border-white/6 text-center select-none flex flex-col items-center justify-center h-48 border-dashed bg-white/[0.005]">
                <Clock className="w-8 h-8 text-neutral-600 mb-2" />
                <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 font-bold">
                  SELECT_AN_INCIDENT_TO_VIEW_TIMELINE
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  )
}

export default Incidents
