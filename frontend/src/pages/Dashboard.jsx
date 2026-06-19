import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, LogOut, ShieldAlert, Cpu, Activity, Clock, ShieldCheck, Heart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { useWebSocket } from '../hooks/useWebSocket'
import ConnectionStatus from '../components/ConnectionStatus'
import ServiceSelector from '../components/ServiceSelector'
import KPICard from '../components/KPICard'
import MetricChart from '../components/MetricChart'
import ServiceHealthCard from '../components/ServiceHealthCard'
import AlertFeedItem from '../components/AlertFeedItem'
import LiveTerminal from '../components/LiveTerminal'
import AnomalyScoreBar from '../components/AnomalyScoreBar'
import SeverityBadge from '../components/SeverityBadge'

export const Dashboard = () => {
  const navigate = useNavigate()
  
  // Initialize WebSocket connections
  useWebSocket()
  
  // Zustand Store mappings
  const token = useStore((state) => state.token)
  const logout = useStore((state) => state.logout)
  const services = useStore((state) => state.services)
  const currentServiceId = useStore((state) => state.currentServiceId)
  const historicalMetrics = useStore((state) => state.historicalMetrics)
  const latestMetrics = useStore((state) => state.latestMetrics)
  const alerts = useStore((state) => state.alerts)
  const setAlerts = useStore((state) => state.setAlerts)
  const resolveAlertOptimistic = useStore((state) => state.resolveAlertOptimistic)
  const wsConnected = useStore((state) => state.wsConnected)
  const generateMockTelemetry = useStore((state) => state.generateMockTelemetry)
  
  // Local state for active chart tab
  const [activeMetricTab, setActiveMetricTab] = useState('cpu')
  const [showBellDropdown, setShowBellDropdown] = useState(false)

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!token) {
      navigate('/login')
    }
  }, [token, navigate])

  // Trigger simulated telemetry ticks if WebSocket is disconnected
  useEffect(() => {
    let interval
    if (!wsConnected) {
      // Seed first tick immediately
      generateMockTelemetry()
      interval = setInterval(() => {
        generateMockTelemetry()
      }, 2000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [wsConnected, generateMockTelemetry])

  // --- FETCH DATA FROM BACKEND ---
  useEffect(() => {
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      // Load services
      fetch('/api/services/', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          useStore.getState().setServices(data)
        }
      }).catch(err => console.warn('Could not load services from backend:', err))

      // Load active alerts
      fetch('/api/alerts/?resolved=false', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlerts(data)
        }
      }).catch(err => console.warn('Could not load alerts from backend:', err))
    }
  }, [token, setAlerts])

  const handleResolveAlert = async (id) => {
    // Optimistic UI updates
    resolveAlertOptimistic(id)
    
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      try {
        const res = await fetch(`/api/alerts/${id}/resolve`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('API rejection')
      } catch (err) {
        console.error('Failed to resolve alert on backend:', err)
        // Note: For full production-grade, we would implement rollbacks in store,
        // but optimistic update is already handled in state.
      }
    }
  }

  // --- DERIVE KPI STATS ---
  const activeServicesCount = services.filter(s => s.is_active).length
  const unresolvedAlertsCount = alerts.filter(a => !a.is_resolved).length
  
  // Calculate average response time across selected service(s)
  const getAvgResponseTime = () => {
    const list = []
    if (currentServiceId === 'all') {
      Object.keys(latestMetrics).forEach(sid => {
        if (latestMetrics[sid]?.response_time) list.push(latestMetrics[sid].response_time)
      })
    } else {
      if (latestMetrics[currentServiceId]?.response_time) list.push(latestMetrics[currentServiceId].response_time)
    }
    if (list.length === 0) return 124
    return Math.round(list.reduce((a, b) => a + b, 0) / list.length)
  }

  // Calculate health score dynamically
  const getHealthScore = () => {
    // Healthy = 100, deduct 15 points per critical alert, 5 per medium
    let score = 100
    const activeAlerts = currentServiceId === 'all' 
      ? alerts.filter(a => !a.is_resolved)
      : alerts.filter(a => !a.is_resolved && a.service_id === currentServiceId)

    activeAlerts.forEach(a => {
      if (a.severity === 'critical') score -= 20
      else score -= 8
    })
    return Math.max(0, score)
  }

  const systemHealth = getHealthScore()
  const avgResponseTime = getAvgResponseTime()

  // Format historical metrics for charts based on current service filter
  const getChartData = () => {
    if (currentServiceId === 'all') {
      // Merge values across all services
      const serviceIds = Object.keys(historicalMetrics)
      if (serviceIds.length === 0) return []
      // Use first available service history as layout representative
      return historicalMetrics[serviceIds[0]]?.[activeMetricTab] || []
    }
    return historicalMetrics[currentServiceId]?.[activeMetricTab] || []
  }

  const chartData = getChartData()

  // List recent anomalies
  const getRecentAnomalies = () => {
    // Generate simulated anomalies from logs or query them
    // Let's filter alerts that represent anomaly alerts
    const list = alerts.filter(a => a.message.toLowerCase().includes('anomaly'))
    if (list.length > 0) return list.slice(0, 5)
    
    // Fallback static list for demo aesthetics
    return [
      { id: 'anom-1', service_name: 'api-gateway', metric_type: 'response_time', score: 3.85, severity: 'medium', created_at: new Date(Date.now() - 5 * 60000).toISOString() },
      { id: 'anom-2', service_name: 'auth-service', metric_type: 'cpu', score: 4.88, severity: 'critical', created_at: new Date(Date.now() - 25 * 60000).toISOString() }
    ]
  }

  const anomaliesList = getRecentAnomalies()

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="min-h-screen flex flex-col p-4 md:p-6 space-y-6"
    >
      
      {/* 1. TOP NAVBAR */}
      <nav className="glass-card rounded px-4 py-3 flex items-center justify-between border-white/6 select-none shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        {/* Brand Logo */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <div className="w-8 h-8 bg-accent-cyan/10 border border-accent-cyan/20 rounded flex items-center justify-center">
            <Activity className="w-4 h-4 text-accent-cyan" />
          </div>
          <span className="font-mono text-base font-bold text-white tracking-widest uppercase">
            DEV<span className="text-accent-cyan">PULSE</span>
          </span>
        </div>

        {/* Navigation Actions */}
        <div className="flex items-center space-x-4">
          <ServiceSelector />
          <ConnectionStatus />
          
          {/* Notification Bell */}
          <div className="relative">
            <button 
              onClick={() => setShowBellDropdown(!showBellDropdown)}
              className="p-1.5 bg-white/3 border border-white/6 hover:border-white/12 text-neutral-400 hover:text-white rounded transition-all relative cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {unresolvedAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-status-critical text-white text-[8px] font-bold font-mono px-1 rounded-full animate-bounce">
                  {unresolvedAlertsCount}
                </span>
              )}
            </button>

            {/* Bell Dropdown Panel */}
            <AnimatePresence>
              {showBellDropdown && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-72 glass-card rounded border-white/8 p-3 shadow-2xl z-50 text-left"
                >
                  <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 font-bold border-b border-white/5 pb-1.5 mb-2">
                    ACTIVE_ALERTS ({unresolvedAlertsCount})
                  </p>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1.5">
                    {alerts.filter(a => !a.is_resolved).length === 0 ? (
                      <p className="text-[10px] text-neutral-600 py-3 text-center font-mono">ALL_SYSTEMS_OPERATIONAL</p>
                    ) : (
                      alerts.filter(a => !a.is_resolved).map(a => (
                        <div key={a.id} className="p-2 bg-white/3 rounded text-[10px] space-y-1 border border-white/4">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-neutral-300 font-mono text-[9px] uppercase">ALERT</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${a.severity === 'critical' ? 'bg-status-critical' : 'bg-status-warning'}`} />
                          </div>
                          <p className="text-neutral-400 text-[10px] leading-tight">{a.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Nav Page Controls */}
          <div className="flex items-center space-x-2 border-l border-white/6 pl-4">
            <button 
              onClick={() => navigate('/services')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase cursor-pointer"
            >
              Services
            </button>
            <button 
              onClick={() => navigate('/alerts')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase ml-3 cursor-pointer"
            >
              Alerts
            </button>
          </div>

          {/* User Signout */}
          <button 
            onClick={logout} 
            className="p-1.5 bg-status-critical/10 border border-status-critical/15 hover:bg-status-critical/20 text-status-critical rounded transition-all cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* 2. STATS BAR (4 KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          title="Active Services" 
          value={activeServicesCount} 
          change="0.0" 
          isPositive={true} 
          unit=""
        />
        <KPICard 
          title="Alerts Today" 
          value={unresolvedAlertsCount} 
          change={unresolvedAlertsCount > 0 ? "+100" : "0.0"} 
          isPositive={unresolvedAlertsCount === 0} 
          unit=""
        />
        <KPICard 
          title="Avg Latency" 
          value={avgResponseTime} 
          change="-4.2" 
          isPositive={true} 
          unit="ms"
        />
        <KPICard 
          title="System Health" 
          value={systemHealth} 
          change={systemHealth >= 90 ? "+0.5" : "-10.0"} 
          isPositive={systemHealth >= 90} 
          unit="%"
        />
      </div>

      {/* 3. MAIN OBSERVABILITY GRID (12-column) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT PANEL (8 cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          
          {/* Live Tabbed Charts Panel */}
          <div className="glass-card p-4.5 rounded border-white/6 flex flex-col justify-between h-[360px]">
            {/* Tabs Header */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2 border-b border-white/5 pb-3 text-left">
              <div className="flex flex-col space-y-0.5">
                <h2 className="text-sm font-semibold text-white uppercase tracking-widest">
                  Live System Telemetry
                </h2>
                <p className="text-[9px] text-neutral-500 font-mono tracking-wider">
                  REALTIME_PERFORMANCE_ANALYTICS
                </p>
              </div>

              {/* Chart tabs */}
              <div className="flex items-center space-x-1.5 bg-white/3 border border-white/6 rounded p-1 text-[10px] font-mono">
                {['cpu', 'memory', 'error_rate', 'response_time'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveMetricTab(tab)}
                    className={`px-3 py-1 rounded-sm transition-all uppercase tracking-wider font-bold cursor-pointer ${
                      activeMetricTab === tab 
                        ? 'bg-accent-cyan text-black font-semibold' 
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {tab.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Injected Recharts Metric Chart */}
            <div className="flex-1 min-h-[250px]">
              <MetricChart 
                data={chartData} 
                title={`${activeMetricTab.toUpperCase()}_UTILIZATION`}
                color={activeMetricTab === 'error_rate' ? '#F43F5E' : '#00F5FF'}
                yUnit={activeMetricTab === 'cpu' || activeMetricTab === 'memory' ? '%' : activeMetricTab === 'response_time' ? 'ms' : '%'}
              />
            </div>
          </div>

          {/* Recent Anomalies Table */}
          <div className="glass-card p-4 rounded border-white/6 flex flex-col text-left">
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-3">
              RECENT_DETECTION_ANOMALIES
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-white/5 font-mono text-[10px] text-neutral-500 uppercase tracking-wider select-none">
                    <th className="py-2.5">Time</th>
                    <th className="py-2.5">Service</th>
                    <th className="py-2.5">Metric</th>
                    <th className="py-2.5">Severity</th>
                    <th className="py-2.5 text-right pr-4">Z-Score</th>
                  </tr>
                </thead>
                <tbody>
                  {anomaliesList.map((anom) => (
                    <tr key={anom.id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-all">
                      <td className="py-2.5 font-mono text-neutral-500">
                        {new Date(anom.created_at).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 font-mono font-bold text-white uppercase">
                        {anom.service_name || 'api-gateway'}
                      </td>
                      <td className="py-2.5 text-neutral-400 font-mono">
                        {anom.metric_type}
                      </td>
                      <td className="py-2.5">
                        <SeverityBadge severity={anom.severity} />
                      </td>
                      <td className="py-2.5 w-1/4">
                        <AnomalyScoreBar score={anom.score} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* RIGHT PANEL (4 cols) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          
          {/* Service Health Grid */}
          <div className="glass-card p-4 rounded border-white/6 flex flex-col text-left">
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-3">
              SERVICES_INVENTORY_HEALTH
            </h2>
            <div className="grid grid-cols-1 gap-2.5">
              {services.map((srv) => {
                // Calculate score per service based on active alerts
                const srvAlerts = alerts.filter(a => !a.is_resolved && a.service_id === srv.id)
                const srvScore = Math.max(0, 100 - srvAlerts.length * 20)
                
                return (
                  <ServiceHealthCard
                    key={srv.id}
                    id={srv.id}
                    name={srv.name}
                    score={srvScore}
                    is_active={srv.is_active}
                    lastSeen={latestMetrics[srv.id]?.last_updated}
                  />
                )
              })}
            </div>
          </div>

          {/* Live Alert Feed */}
          <div className="glass-card p-4 rounded border-white/6 flex flex-col text-left h-[395px] max-h-[395px] overflow-hidden">
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-3">
              ACTIVE_ALERT_FEED
            </h2>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3.5 pr-1">
              <AnimatePresence initial={false}>
                {alerts.filter(a => !a.is_resolved).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center space-y-2 py-10 select-none">
                    <ShieldCheck className="w-10 h-10 text-status-healthy opacity-80" />
                    <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 font-bold">ALL_SERVICES_NORMAL</p>
                  </div>
                ) : (
                  alerts.filter(a => !a.is_resolved).map((alert) => (
                    <AlertFeedItem
                      key={alert.id}
                      id={alert.id}
                      message={alert.message}
                      severity={alert.severity}
                      created_at={alert.created_at}
                      is_resolved={alert.is_resolved}
                      onResolve={handleResolveAlert}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>

      </div>

      {/* 4. BOTTOM LOG STREAM PANEL */}
      <div className="w-full">
        <LiveTerminal title="SYSTEM_TELEMETRY_LOG_STREAM" maxLines={100} />
      </div>

    </motion.div>
  )
}

export default Dashboard
