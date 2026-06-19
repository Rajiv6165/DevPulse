import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Filter, Check, LogOut, ChevronLeft } from 'lucide-react'
import { useStore } from '../store/useStore'
import ConnectionStatus from '../components/ConnectionStatus'
import SeverityBadge from '../components/SeverityBadge'

export const Alerts = () => {
  const navigate = useNavigate()
  const token = useStore((state) => state.token)
  const logout = useStore((state) => state.logout)
  const services = useStore((state) => state.services)
  const alerts = useStore((state) => state.alerts)
  const setAlerts = useStore((state) => state.setAlerts)
  const resolveAlertOptimistic = useStore((state) => state.resolveAlertOptimistic)

  // Filter States
  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterService, setFilterService] = useState('all')
  const [showResolved, setShowResolved] = useState(false)

  // Redirect if unauthenticated
  useEffect(() => {
    if (!token) navigate('/login')
  }, [token, navigate])

  const fetchAlerts = () => {
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      const url = showResolved ? '/api/alerts/' : '/api/alerts/?resolved=false'
      fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setAlerts(data)
      })
      .catch(err => console.error('Could not fetch alerts:', err))
    }
  }

  useEffect(() => {
    fetchAlerts()
  }, [token, showResolved])

  const handleResolveAlert = async (id) => {
    resolveAlertOptimistic(id)
    
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      try {
        const res = await fetch(`/api/alerts/${id}/resolve`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('Failed to resolve alert')
        fetchAlerts()
      } catch (err) {
        console.error(err)
      }
    }
  }

  // --- FILTER ALERTS IN MEMORY ---
  const filteredAlerts = alerts.filter((alert) => {
    const serviceMatch = filterService === 'all' || alert.service_id === filterService
    const severityMatch = filterSeverity === 'all' || alert.severity === filterSeverity
    const resolvedMatch = showResolved ? true : !alert.is_resolved
    return serviceMatch && severityMatch && resolvedMatch
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="min-h-screen flex flex-col p-4 md:p-6 space-y-6"
    >
      
      {/* 1. TOP NAVBAR */}
      <nav className="glass-card rounded px-4 py-3 flex items-center justify-between border-white/6 select-none shadow-2xl">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <ChevronLeft className="w-4 h-4 text-neutral-400" />
          <span className="font-mono text-base font-bold text-white tracking-widest uppercase">
            DEV<span className="text-accent-cyan">PULSE</span> / ALERTS
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <ConnectionStatus />
          <div className="flex items-center space-x-2 border-l border-white/6 pl-4">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase cursor-pointer"
            >
              Dashboard
            </button>
            <button 
              onClick={() => navigate('/services')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase ml-3 cursor-pointer"
            >
              Services
            </button>
          </div>
          <button 
            onClick={logout} 
            className="p-1.5 bg-status-critical/10 border border-status-critical/15 hover:bg-status-critical/20 text-status-critical rounded cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* 2. FILTER BAR */}
      <div className="glass-card p-4 rounded border-white/6 flex items-center justify-between flex-wrap gap-4 text-left select-none">
        <div className="flex items-center space-x-4 flex-wrap gap-2 text-xs font-mono">
          <div className="flex items-center space-x-2 text-neutral-400">
            <Filter className="w-3.5 h-3.5 text-accent-cyan" />
            <span className="font-bold">FILTERS:</span>
          </div>

          {/* Service filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-neutral-500 uppercase">Service</span>
            <select
              value={filterService}
              onChange={(e) => setFilterService(e.target.value)}
              className="bg-white/4 border border-white/8 rounded px-2.5 py-1 text-xs text-neutral-200 outline-none cursor-pointer"
            >
              <option value="all" className="bg-background text-neutral-300">ALL</option>
              {services.map(s => (
                <option key={s.id} value={s.id} className="bg-background text-neutral-300">
                  {s.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Severity filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-neutral-500 uppercase">Severity</span>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="bg-white/4 border border-white/8 rounded px-2.5 py-1 text-xs text-neutral-200 outline-none cursor-pointer"
            >
              <option value="all" className="bg-background text-neutral-300">ALL</option>
              <option value="low" className="bg-background text-status-healthy">LOW</option>
              <option value="medium" className="bg-background text-status-warning">MEDIUM</option>
              <option value="critical" className="bg-background text-status-critical">CRITICAL</option>
            </select>
          </div>
        </div>

        {/* Resolved show toggle */}
        <div className="flex items-center space-x-2 select-none cursor-pointer" onClick={() => setShowResolved(!showResolved)}>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={() => {}} // Controlled via container div click
            className="w-3.5 h-3.5 rounded border border-white/10 accent-accent-cyan cursor-pointer"
          />
          <span className="font-mono text-[10px] text-neutral-400 tracking-wider uppercase">SHOW_RESOLVED_ALERTS</span>
        </div>
      </div>

      {/* 3. ALERTS TABLE GRID */}
      <div className="glass-card p-6 rounded border-white/6 text-left flex-1">
        <h2 className="text-xs font-semibold text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-4">
          SYSTEM_ALERT_MANAGEMENT
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-white/5 font-mono text-[10px] text-neutral-500 uppercase tracking-wider select-none">
                <th className="py-3 pl-2">Severity</th>
                <th className="py-3">Trigger Message</th>
                <th className="py-3">Service Name</th>
                <th className="py-3">Created At</th>
                <th className="py-3 text-right pr-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 font-mono text-neutral-600">
                    NO_ALERTS_MATCH_CRITERIA
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert) => {
                  const alertSrv = services.find(s => s.id === alert.service_id)
                  
                  return (
                    <tr key={alert.id} className="border-b border-white/[0.015] hover:bg-white/[0.01] transition-all">
                      <td className="py-4.5 pl-2">
                        <SeverityBadge severity={alert.severity} />
                      </td>
                      <td className="py-4.5 text-neutral-200 font-medium">
                        <div className="flex items-center space-x-2">
                          <AlertCircle className={`w-3.5 h-3.5 text-neutral-500 ${
                            alert.severity === 'critical' ? 'text-status-critical' : 'text-status-warning'
                          }`} />
                          <span>{alert.message}</span>
                        </div>
                      </td>
                      <td className="py-4.5 font-mono text-white uppercase font-bold">
                        {alertSrv ? alertSrv.name : 'UNKNOWN'}
                      </td>
                      <td className="py-4.5 font-mono text-neutral-500">
                        {new Date(alert.created_at).toLocaleString()}
                      </td>
                      <td className="py-4.5 text-right pr-2">
                        {alert.is_resolved ? (
                          <span className="text-[10px] font-mono text-neutral-500 tracking-wider uppercase font-semibold">
                            RESOLVED
                          </span>
                        ) : (
                          <button
                            onClick={() => handleResolveAlert(alert.id)}
                            className="bg-white/5 border border-white/8 hover:bg-accent-cyan/5 hover:border-accent-cyan/30 hover:text-accent-cyan font-mono font-bold text-[9px] uppercase px-3 py-1 rounded transition-all select-none cursor-pointer inline-flex items-center space-x-1"
                          >
                            <Check className="w-3 h-3 text-status-healthy" />
                            <span>RESOLVE</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </motion.div>
  )
}

export default Alerts
export { AlertCircle }
