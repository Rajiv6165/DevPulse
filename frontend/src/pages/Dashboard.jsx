import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, LogOut, ShieldAlert, Cpu, Activity, Clock, ShieldCheck, Heart, AlertOctagon } from 'lucide-react'
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
import SeverityBadge from '../components/SeverityBadge'
import IncidentCard from '../components/IncidentCard'
import SkeletonLoader from '../components/SkeletonLoader'

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
  const incidents = useStore((state) => state.incidents)
  const setIncidents = useStore((state) => state.setIncidents)
  const toasts = useStore((state) => state.toasts)
  const removeToast = useStore((state) => state.removeToast)
  const resolveAlertOptimistic = useStore((state) => state.resolveAlertOptimistic)
  const wsConnected = useStore((state) => state.wsConnected)
  const generateMockTelemetry = useStore((state) => state.generateMockTelemetry)
  
  // Local state for active chart tab and forecast data
  const [activeMetricTab, setActiveMetricTab] = useState('cpu')
  const [showBellDropdown, setShowBellDropdown] = useState(false)
  const [forecastData, setForecastData] = useState([])
  const [isChartLoading, setIsChartLoading] = useState(false)

  // Redirect to login if unauthenticated
  useEffect(() => {
    if (!token) {
      navigate('/login')
    }
  }, [token, navigate])

  // Call initializeDemoData if page is reloaded in demo mode and services is empty
  useEffect(() => {
    if (token === 'demo_jwt_token_key_devpulse' && services.length === 0) {
      useStore.getState().initializeDemoData()
    }
  }, [token, services.length])

  // Trigger simulated telemetry ticks if WebSocket is disconnected (non-demo fallback only)
  useEffect(() => {
    let interval
    if (!wsConnected && token !== 'demo_jwt_token_key_devpulse') {
      generateMockTelemetry()
      interval = setInterval(() => {
        generateMockTelemetry()
      }, 2000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [wsConnected, generateMockTelemetry, token])

  // Chart loader state on tab or service changes
  useEffect(() => {
    setIsChartLoading(true)
    const timer = setTimeout(() => {
      setIsChartLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [activeMetricTab, currentServiceId])

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

      // Load active incidents
      fetch('/api/incidents/?active=true', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setIncidents(data)
        }
      }).catch(err => console.warn('Could not load incidents from backend:', err))
    }
  }, [token, setAlerts, setIncidents])

  // Format historical metrics for charts based on current service filter
  const chartData = useMemo(() => {
    if (currentServiceId === 'all') {
      const serviceIds = Object.keys(historicalMetrics)
      if (serviceIds.length === 0) return []
      return historicalMetrics[serviceIds[0]]?.[activeMetricTab] || []
    }
    return historicalMetrics[currentServiceId]?.[activeMetricTab] || []
  }, [historicalMetrics, currentServiceId, activeMetricTab])

  // Fetch forecast telemetry
  useEffect(() => {
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      const serviceId = currentServiceId === 'all'
        ? (services.length > 0 ? services[0].id : null)
        : currentServiceId

      if (serviceId) {
        fetch(`/api/analytics/${serviceId}/forecast?metric_type=${activeMetricTab}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.forecast)) {
            setForecastData(data.forecast)
          } else {
            setForecastData([])
          }
        })
        .catch(err => {
          console.warn('Could not load forecast from backend:', err)
          setForecastData([])
        })
      } else {
        setForecastData([])
      }
    } else {
      // Mock forecast telemetry for demo mode
      const mockForecast = []
      const now = Date.now()
      const lastValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 50
      for (let i = 1; i <= 15; i++) {
        mockForecast.push({
          timestamp: new Date(now + i * 60000).toISOString(),
          value: lastValue + (Math.random() - 0.4) * 10
        })
      }
      setForecastData(mockForecast)
    }
  }, [token, currentServiceId, activeMetricTab, services, chartData])

  const handleResolveAlert = async (id) => {
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
      }
    }
  }

  // --- DERIVE KPI STATS ---
  const activeServicesCount = services.filter(s => s.is_active).length
  const activeIncidents = incidents.filter(i => !i.resolved_at)
  const activeIncidentsCount = activeIncidents.length
  const unresolvedAlertsCount = alerts.filter(a => !a.is_resolved).length
  
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

  const getHealthScore = () => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="min-h-screen flex flex-col p-4 md:p-6 space-y-6 select-none relative"
    >
      
      {/* Demo Mode Banner */}
      {token === 'demo_jwt_token_key_devpulse' && (
        <div className="bg-gradient-to-r from-accent-cyan/10 via-accent-cyan/20 to-accent-cyan/10 border border-accent-cyan/20 rounded px-4 py-2.5 flex items-center justify-between text-xs font-mono text-accent-cyan shadow-[0_0_15px_rgba(0,245,255,0.05)] select-none">
          <div className="flex items-center space-x-2.5 text-left">
            <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse shadow-[0_0_8px_#00F5FF]" />
            <span><strong>DEMO MODE ACTIVE</strong> — Operating in sandbox mode with simulated real-time telemetry. Feel free to explore all features, click tabs, filter services, and resolve alerts locally.</span>
          </div>
        </div>
      )}
      
      {/* Real-time Toast Notifications Container Overlay */}
      <div className="fixed top-6 right-6 z-50 flex flex-col space-y-2 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className="pointer-events-auto bg-[#0A0A0A]/95 border border-white/8 p-4 rounded-lg shadow-2xl backdrop-blur-sm flex flex-col space-y-1 text-left relative overflow-hidden"
              style={{ borderLeft: t.type === 'predictive' ? '4px solid #A78BFA' : t.type === 'incident' ? '4px solid #F43F5E' : '4px solid #00F5FF' }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-white uppercase">{t.title}</span>
                <button onClick={() => removeToast(t.id)} className="text-neutral-500 hover:text-white font-mono text-[9px] cursor-pointer">✕</button>
              </div>
              <p className="text-neutral-300 text-[11px] font-sans font-medium leading-relaxed">{t.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 1. TOP NAVBAR */}
      <nav className="glass-card rounded px-4 py-3 flex items-center justify-between border-white/6 select-none shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <div className="w-8 h-8 bg-accent-cyan/10 border border-accent-cyan/20 rounded flex items-center justify-center">
            <Activity className="w-4 h-4 text-accent-cyan" />
          </div>
          <span className="font-mono text-base font-bold text-white tracking-widest uppercase">
            DEV<span className="text-accent-cyan">PULSE</span>
          </span>
        </div>

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

          {/* Navigation links */}
          <div className="flex items-center space-x-2 border-l border-white/6 pl-4 font-mono">
            <button 
              onClick={() => navigate('/services')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase cursor-pointer"
            >
              Services
            </button>
            <button 
              onClick={() => navigate('/incidents')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase ml-3 cursor-pointer"
            >
              Incidents
            </button>
            <button 
              onClick={() => navigate('/alerts')} 
              className="text-xs font-mono font-semibold text-neutral-400 hover:text-white transition-all tracking-wider uppercase ml-3 cursor-pointer"
            >
              Alerts
            </button>
          </div>

          <button 
            onClick={logout} 
            className="p-1.5 bg-status-critical/10 border border-status-critical/15 hover:bg-status-critical/20 text-status-critical rounded transition-all cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* 2. STATS BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          title="Active Services" 
          value={activeServicesCount} 
          change="0.0" 
          isPositive={true} 
          unit=""
        />
        <KPICard 
          title="Active Incidents" 
          value={activeIncidentsCount} 
          change={activeIncidentsCount > 0 ? `+${activeIncidentsCount}` : "0.0"} 
          isPositive={activeIncidentsCount === 0} 
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

      {/* 3. MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT PANEL */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
          
          {/* Live Charts */}
          <div className="glass-card p-4.5 rounded border-white/6 flex flex-col justify-between h-[360px]">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2 border-b border-white/5 pb-3 text-left">
              <div className="flex flex-col space-y-0.5">
                <h2 className="text-sm font-semibold text-white uppercase tracking-widest">
                  Live System Telemetry
                </h2>
                <p className="text-[9px] text-neutral-500 font-mono tracking-wider">
                  REALTIME_PERFORMANCE_ANALYTICS_WITH_15M_FORECAST
                </p>
              </div>

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

            <div className="flex-1 min-h-[250px] relative">
              {isChartLoading ? (
                <div className="h-[250px] flex items-center justify-center">
                  <SkeletonLoader type="chart" />
                </div>
              ) : (
                <MetricChart 
                  data={chartData} 
                  forecastData={forecastData}
                  title={`${activeMetricTab.toUpperCase()}_UTILIZATION`}
                  color={activeMetricTab === 'error_rate' ? '#F43F5E' : '#00F5FF'}
                  yUnit={activeMetricTab === 'cpu' || activeMetricTab === 'memory' ? '%' : activeMetricTab === 'response_time' ? 'ms' : '%'}
                />
              )}
            </div>
          </div>

          {/* Expandable Incidents Feed */}
          <div className="glass-card p-4.5 rounded border-white/6 flex flex-col text-left">
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-3">
              ACTIVE_CORRELATED_INCIDENTS ({activeIncidents.length})
            </h2>
            <div className="space-y-3">
              {activeIncidents.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-2 border border-dashed border-white/5 rounded-lg bg-white/[0.01]">
                  <ShieldCheck className="w-8 h-8 text-status-healthy opacity-80" />
                  <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 font-bold">
                    NO_ACTIVE_INCIDENTS_FOUND
                  </p>
                </div>
              ) : (
                activeIncidents.map((inc) => (
                  <IncidentCard key={inc.id} incident={inc} />
                ))
              )}
            </div>
          </div>

        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          
          {/* Service Health Grid */}
          <div className="glass-card p-4 rounded border-white/6 flex flex-col text-left">
            <h2 className="text-xs font-semibold text-white uppercase tracking-widest border-b border-white/5 pb-2 mb-3">
              SERVICES_INVENTORY_HEALTH
            </h2>
            <div className="grid grid-cols-1 gap-2.5">
              {services.map((srv) => {
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
        <LiveTerminal title="SYSTEM_TELEMETRY_LOG_STREAM" maxLines={50} />
      </div>

    </motion.div>
  )
}

export default Dashboard
