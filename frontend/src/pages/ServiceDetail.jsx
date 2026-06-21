import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, LogOut, Terminal, Clipboard, Check, Activity, ShieldAlert, Cpu, HardDrive, Percent, Clock, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import ConnectionStatus from '../components/ConnectionStatus'
import MetricChart from '../components/MetricChart'
import SeverityBadge from '../components/SeverityBadge'
import ConfidenceRing from '../components/ConfidenceRing'
import AnomalyScoreBar from '../components/AnomalyScoreBar'
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export const ServiceDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()

  const token = useStore((state) => state.token)
  const logout = useStore((state) => state.logout)
  const services = useStore((state) => state.services)
  const historicalMetrics = useStore((state) => state.historicalMetrics)
  const alerts = useStore((state) => state.alerts)
  const incidents = useStore((state) => state.incidents)
  const setIncidents = useStore((state) => state.setIncidents)
  const resolveIncidentOptimistic = useStore((state) => state.resolveIncidentOptimistic)

  const [timeframe, setTimeframe] = useState('1h')
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('metrics') // 'metrics' | 'timeline' | 'sdk'

  // Forecast states
  const [cpuForecast, setCpuForecast] = useState([])
  const [memoryForecast, setMemoryForecast] = useState([])
  const [errorRateForecast, setErrorRateForecast] = useState([])
  const [responseTimeForecast, setResponseTimeForecast] = useState([])

  // Anomalies states
  const [anomalies, setAnomalies] = useState([])
  const [isAnomaliesLoading, setIsAnomaliesLoading] = useState(false)

  // Redirect if unauthenticated
  useEffect(() => {
    if (!token) navigate('/login')
  }, [token, navigate])

  const service = services.find((s) => s.id === id)

  // Load telemetry metrics lists
  const serviceHistory = historicalMetrics[id] || {
    cpu: [],
    memory: [],
    error_rate: [],
    response_time: [],
  }

  // Filter alerts for this service
  const serviceAlerts = alerts.filter((a) => a.service_id === id)

  // Filter incidents for this service
  const serviceIncidents = incidents.filter(
    (incident) => incident.root_cause_service_id === id || incident.affected_service_ids?.includes(id)
  )

  // Fetch forecast metrics
  useEffect(() => {
    if (!service) return

    const metricTypes = ['cpu', 'memory', 'error_rate', 'response_time']
    const setters = {
      cpu: setCpuForecast,
      memory: setMemoryForecast,
      error_rate: setErrorRateForecast,
      response_time: setResponseTimeForecast
    }

    if (token && token !== 'demo_jwt_token_key_devpulse') {
      metricTypes.forEach(metricType => {
        fetch(`/api/analytics/${id}/forecast?metric_type=${metricType}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.forecast)) {
            setters[metricType](data.forecast)
          } else {
            setters[metricType]([])
          }
        })
        .catch(err => {
          console.warn(`Could not load forecast for ${metricType} from backend:`, err)
          setters[metricType]([])
        })
      })
    } else {
      // Mock forecast telemetry for demo mode
      const now = Date.now()
      metricTypes.forEach(metricType => {
        const history = serviceHistory[metricType] || []
        const lastValue = history.length > 0 ? history[history.length - 1].value : (metricType === 'response_time' ? 120 : 50)
        const mockForecast = []
        for (let i = 1; i <= 15; i++) {
          let val = lastValue
          if (metricType === 'cpu') val = Math.max(10, Math.min(95, lastValue + (Math.random() - 0.4) * 8))
          else if (metricType === 'memory') val = Math.max(20, Math.min(90, lastValue + (Math.random() - 0.4) * 4))
          else if (metricType === 'error_rate') val = Math.max(0, Math.min(5, lastValue + (Math.random() - 0.4) * 0.5))
          else if (metricType === 'response_time') val = Math.max(30, Math.min(800, lastValue + (Math.random() - 0.4) * 40))

          mockForecast.push({
            timestamp: new Date(now + i * 60000).toISOString(),
            value: val
          })
        }
        setters[metricType](mockForecast)
      })
    }
  }, [token, id, service, serviceHistory.cpu, serviceHistory.memory, serviceHistory.error_rate, serviceHistory.response_time])

  // Fetch anomalies for this service
  useEffect(() => {
    if (!service) return

    if (token && token !== 'demo_jwt_token_key_devpulse') {
      setIsAnomaliesLoading(true)
      fetch(`/api/analytics/${id}/anomalies?hours=24`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAnomalies(data)
        } else {
          setAnomalies([])
        }
      })
      .catch(err => {
        console.warn('Could not load anomalies from backend:', err)
        setAnomalies([])
      })
      .finally(() => {
        setIsAnomaliesLoading(false)
      })
    } else {
      // Mock anomalies for demo mode
      const now = Date.now()
      const mockAnoms = [
        {
          id: 'anom-cpu-1',
          service_id: id,
          metric_type: 'cpu',
          score: 4.8,
          detected_at: new Date(now - 15 * 60000).toISOString(),
          context: { explanation: 'CPU spike to 94.2% matched historical anomaly pattern.' }
        },
        {
          id: 'anom-mem-2',
          service_id: id,
          metric_type: 'memory',
          score: 3.2,
          detected_at: new Date(now - 90 * 60000).toISOString(),
          context: { explanation: 'Memory allocation exceeded 88.5% of reservoir limits.' }
        },
        {
          id: 'anom-err-3',
          service_id: id,
          metric_type: 'error_rate',
          score: 2.6,
          detected_at: new Date(now - 180 * 60000).toISOString(),
          context: { explanation: 'Error rate elevated to 2.8% on gateway routing.' }
        },
        {
          id: 'anom-lat-4',
          service_id: id,
          metric_type: 'response_time',
          score: 3.9,
          detected_at: new Date(now - 320 * 60000).toISOString(),
          context: { explanation: 'Response latency exceeded warning threshold of 500ms.' }
        }
      ]
      setAnomalies(mockAnoms)
    }
  }, [token, id, service])

  // Load incidents from backend on service detail mount
  useEffect(() => {
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      fetch('/api/incidents/', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setIncidents(data)
        }
      })
      .catch(err => console.warn('Could not load incidents in service details:', err))
    }
  }, [token, setIncidents])

  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background font-mono text-xs">
        <p className="text-status-critical">ERROR: SERVICE_NOT_FOUND_OR_ACCESS_DENIED</p>
      </div>
    )
  }

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getElapsedMinutes = (startedAt) => {
    try {
      const elapsedMs = Date.now() - new Date(startedAt).getTime()
      return Math.max(0, Math.floor(elapsedMs / 60000))
    } catch {
      return 0
    }
  }

  const handleResolveIncident = async (incidentId) => {
    resolveIncidentOptimistic(incidentId)
    
    if (token && token !== 'demo_jwt_token_key_devpulse') {
      try {
        await fetch(`/api/incidents/${incidentId}/resolve`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      } catch (err) {
        console.warn('Could not resolve incident on backend:', err)
      }
    }
  }

  // Format scatter data for Recharts
  const scatterData = anomalies.map((anom) => ({
    x: new Date(anom.detected_at).getTime(),
    y: parseFloat(anom.score),
    z: parseFloat(anom.score),
    ...anom
  }))

  const formatScatterXAxis = (tick) => {
    try {
      const date = new Date(tick)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  const ScatterTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      const timeStr = new Date(data.x).toLocaleString()
      const explanation = data.context?.explanation || data.context?.reason || 'Anomaly detected in telemetry metric.'
      
      return (
        <div className="bg-[#0A0A0A]/95 border border-white/8 px-3 py-2 rounded shadow-2xl font-mono text-[9px] text-left max-w-xs backdrop-blur-md">
          <p className="text-neutral-500 mb-1">{timeStr}</p>
          <p className="font-bold text-white uppercase mb-0.5">
            Metric: <span className="text-accent-cyan">{data.metric_type.toUpperCase()}</span>
          </p>
          <p className="font-bold text-white uppercase mb-1">
            Anomaly Score: <span className="text-status-critical">{data.y.toFixed(2)}</span>
          </p>
          <div className="border-t border-white/5 pt-1 mt-1 text-[9px] text-neutral-400 font-sans leading-normal">
            {explanation}
          </div>
        </div>
      )
    }
    return null
  }

  // --- PYTHON SDK SNIPPET (Syntax colored) ---
  const sdkCode = `import requests
import time
import random

# Initialize DevPulse Client Credentials
API_KEY = "${service.api_key}"
ENDPOINT = "http://localhost:8000/metrics/ingest"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

def report_health():
    payload = {
        "service_id": "${service.id}",
        "metric_type": "cpu", # cpu, memory, error_rate, response_time, custom
        "value": round(random.uniform(20.0, 85.0), 2),
        "metadata": {
            "environment": "production",
            "host_id": "aws-node-prod-1a"
        }
    }
    
    try:
        response = requests.post(ENDPOINT, json=payload, headers=headers)
        if response.status_code == 201:
            print("Telemetry reporting success.")
        else:
            print(f"Error: Status code {response.status_code}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    while True:
        report_health()
        time.sleep(5)  # Report metrics every 5 seconds`

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="min-h-screen flex flex-col p-4 md:p-6 space-y-6"
    >
      
      {/* 1. NAVBAR */}
      <nav className="glass-card rounded px-4 py-3 flex items-center justify-between border-white/6 select-none shadow-2xl">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/services')}>
          <ChevronLeft className="w-4 h-4 text-neutral-400" />
          <span className="font-mono text-base font-bold text-white tracking-widest uppercase">
            DEV<span className="text-accent-cyan">PULSE</span> / SERVICES / <span className="text-accent-cyan">{service.name}</span>
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <ConnectionStatus />
          <div className="flex items-center space-x-2 border-l border-white/6 pl-4 font-mono text-xs">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="text-neutral-400 hover:text-white transition-all tracking-wider uppercase cursor-pointer"
            >
              Dashboard
            </button>
            <button 
              onClick={() => navigate('/services')} 
              className="text-neutral-400 hover:text-white transition-all tracking-wider uppercase ml-3 cursor-pointer"
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

      {/* 2. TABBED DEEP DIVE CONTROLS */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2 flex-wrap gap-3 text-left select-none">
        <div className="flex items-center space-x-2 bg-white/3 border border-white/6 p-1 rounded font-mono text-[10px]">
          <button
            onClick={() => setActiveTab('metrics')}
            className={`px-4 py-1.5 rounded-sm uppercase tracking-wider font-bold cursor-pointer ${
              activeTab === 'metrics' ? 'bg-accent-cyan text-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            METRIC_DASHBOARDS
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-4 py-1.5 rounded-sm uppercase tracking-wider font-bold cursor-pointer ${
              activeTab === 'timeline' ? 'bg-accent-cyan text-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            ANOMALY_TIMELINE
          </button>
          <button
            onClick={() => setActiveTab('sdk')}
            className={`px-4 py-1.5 rounded-sm uppercase tracking-wider font-bold cursor-pointer ${
              activeTab === 'sdk' ? 'bg-accent-cyan text-black' : 'text-neutral-400 hover:text-white'
            }`}
          >
            SDK_INTEGRATION
          </button>
        </div>

        {/* Timeframe selector */}
        {activeTab === 'metrics' && (
          <div className="flex items-center space-x-1.5 bg-white/3 border border-white/6 rounded p-0.5 text-[9px] font-mono">
            {['1h', '6h', '24h'].map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-2.5 py-1 rounded-sm cursor-pointer uppercase ${
                  timeframe === t ? 'bg-white/10 text-white font-bold' : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. TABS CONTENTS */}
      <div className="flex-1 w-full">
        {activeTab === 'metrics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MetricChart data={serviceHistory.cpu} forecastData={cpuForecast} title="CPU_LOAD" color="#00F5FF" yUnit="%" />
            <MetricChart data={serviceHistory.memory} forecastData={memoryForecast} title="MEMORY_RESERVE" color="#10B981" yUnit="%" />
            <MetricChart data={serviceHistory.error_rate} forecastData={errorRateForecast} title="ERROR_RATES" color="#F43F5E" yUnit="%" />
            <MetricChart data={serviceHistory.response_time} forecastData={responseTimeForecast} title="RESPONSE_LATENCY" color="#F59E0B" yUnit="ms" />
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-6">
            
            {/* Scatter Chart grid container */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* Scatter Chart map */}
              <div className="lg:col-span-2 glass-card p-5 rounded border-white/6 text-left flex flex-col justify-between h-[360px]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col space-y-1">
                    <h3 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">
                      Anomaly Score Scatter Map
                    </h3>
                    <p className="text-[9px] text-neutral-500 font-mono uppercase tracking-wider">
                      Scatter dots representing ML anomaly confidence over the last 24 hours
                    </p>
                  </div>
                  <span className="font-mono text-[8px] text-status-critical bg-status-critical/8 border border-status-critical/15 px-2 py-0.5 rounded uppercase">
                    ML_ENGINE
                  </span>
                </div>

                <div className="flex-1 w-full min-h-[220px]">
                  {isAnomaliesLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center space-y-2 select-none">
                      <div className="w-5 h-5 border-2 border-status-critical border-t-transparent rounded-full animate-spin" />
                      <span className="font-mono text-[8px] text-neutral-500 tracking-widest">LOADING_ANOMALIES</span>
                    </div>
                  ) : scatterData.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center space-y-1 select-none border border-white/5 border-dashed rounded bg-white/[0.003]">
                      <Clock className="w-6 h-6 text-neutral-600 mb-1" />
                      <span className="font-mono text-[8px] text-neutral-500 uppercase tracking-widest">NO_ANOMALIES_FOUND_24H</span>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 15, left: -22, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.015)" />
                        <XAxis 
                          dataKey="x" 
                          tickFormatter={formatScatterXAxis} 
                          stroke="rgba(255,255,255,0.08)"
                          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: 'JetBrains Mono' }}
                          type="number"
                          domain={['auto', 'auto']}
                        />
                        <YAxis 
                          dataKey="y"
                          name="Score"
                          stroke="rgba(255,255,255,0.08)"
                          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 7, fontFamily: 'JetBrains Mono' }}
                          domain={[0, 'auto']}
                        />
                        <ZAxis 
                          dataKey="z" 
                          range={[40, 300]} 
                        />
                        <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.05)' }} />
                        <Scatter name="Anomalies" data={scatterData} fill="#F43F5E" line={false} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Incidents involvement list */}
              <div className="glass-card p-5 rounded border-white/6 text-left flex flex-col h-[360px]">
                <div className="flex flex-col space-y-1 mb-4">
                  <h3 className="text-xs font-semibold text-white uppercase tracking-widest font-mono">
                    Incident Involvement
                  </h3>
                  <p className="text-[9px] text-neutral-500 font-mono uppercase tracking-wider">
                    Incidents cascading through or caused by this service
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                  {serviceIncidents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-1 select-none border border-white/5 border-dashed rounded bg-white/[0.003] p-4 text-center">
                      <ShieldAlert className="w-6 h-6 text-neutral-600 mb-1" />
                      <span className="font-mono text-[8px] text-neutral-500 uppercase tracking-widest font-bold">
                        SERVICE_IS_HEALTHY
                      </span>
                      <p className="text-[9px] text-neutral-600 font-mono mt-1">
                        NO_ACTIVE_OR_RESOLVED_INCIDENTS
                      </p>
                    </div>
                  ) : (
                    serviceIncidents.map((inc) => (
                      <div 
                        key={inc.id} 
                        className="p-3 bg-white/2 border border-white/4 hover:border-white/8 transition-all rounded space-y-2.5 font-mono text-[10px]"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <span className="font-bold text-white">
                            INCIDENT_{inc.id.substring(0, 8).toUpperCase()}
                          </span>
                          
                          {inc.resolved_at ? (
                            <span className="text-[7px] font-bold text-status-healthy px-1 bg-status-healthy/10 border border-status-healthy/20 rounded uppercase">
                              RESOLVED
                            </span>
                          ) : (
                            <span className="text-[7px] font-bold text-status-critical px-1 bg-status-critical/10 border border-status-critical/20 rounded uppercase animate-pulse">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        <p className="text-neutral-400 font-sans text-[11px] leading-relaxed">
                          {inc.summary || "Grouped incident propagation."}
                        </p>

                        <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
                          <span className="text-[8px] text-neutral-500">
                            Role: {inc.root_cause_service_id === id ? '🚨 Root Cause' : '🔗 Affected'}
                          </span>
                          {!inc.resolved_at && (
                            <button
                              onClick={() => handleResolveIncident(inc.id)}
                              className="px-2 py-0.5 bg-status-healthy/10 hover:bg-status-healthy/20 border border-status-healthy/20 text-status-healthy text-[8px] rounded uppercase cursor-pointer transition-all"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Detailed anomaly logs list */}
            <div className="glass-card p-6 rounded border-white/6 text-left">
              <h3 className="text-xs font-semibold text-white uppercase tracking-widest font-mono mb-4">
                Chronological Anomaly Log History
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-white/5 font-mono text-[10px] text-neutral-500 uppercase tracking-wider select-none">
                      <th className="py-2.5">Anomaly Event</th>
                      <th className="py-2.5">Score Strength</th>
                      <th className="py-2.5">Confidence Rating</th>
                      <th className="py-2.5">Detected At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center py-4 font-mono text-neutral-600">
                          NO_ANOMALIES_RECORDED
                        </td>
                      </tr>
                    ) : (
                      anomalies.map((anom) => (
                        <tr key={anom.id} className="border-b border-white/[0.01]">
                          <td className="py-3 pr-4">
                            <div className="flex flex-col space-y-1">
                              <span className="font-mono text-[10px] font-bold text-white uppercase tracking-wide">
                                Anomaly on {anom.metric_type.toUpperCase()}
                              </span>
                              <span className="font-sans text-[11px] text-neutral-400 leading-relaxed">
                                {anom.context?.explanation || anom.context?.reason || "High deviation observed in performance trends."}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 w-40 pr-6">
                            <AnomalyScoreBar score={anom.score} />
                          </td>
                          <td className="py-3">
                            {/* Score maps to confidence scale: standard range 0 to 5, normalized to 0-1 */}
                            <ConfidenceRing confidence={anom.score / 5.0} size={28} strokeWidth={2} />
                          </td>
                          <td className="py-3 font-mono text-neutral-500">
                            {new Date(anom.detected_at).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Alert history table */}
            <div className="glass-card p-6 rounded border-white/6 text-left">
              <h3 className="text-xs font-semibold text-white uppercase tracking-widest font-mono mb-4">
                Alert History Logs
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-white/5 font-mono text-[10px] text-neutral-500 uppercase tracking-wider select-none">
                      <th className="py-2.5">Alert Message</th>
                      <th className="py-2.5">Severity</th>
                      <th className="py-2.5">Created At</th>
                      <th className="py-2.5 text-right pr-2">Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceAlerts.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="text-center py-4 font-mono text-neutral-600">
                          NO_ALERTS_RECORDED
                        </td>
                      </tr>
                    ) : (
                      serviceAlerts.map((alert) => (
                        <tr key={alert.id} className="border-b border-white/[0.01]">
                          <td className="py-3 text-neutral-200">{alert.message}</td>
                          <td className="py-3">
                            <SeverityBadge severity={alert.severity} />
                          </td>
                          <td className="py-3 font-mono text-neutral-500">
                            {new Date(alert.created_at).toLocaleString()}
                          </td>
                          <td className="py-3 text-right pr-2 font-mono">
                            {alert.is_resolved ? (
                              <span className="text-status-healthy">YES</span>
                            ) : (
                              <span className="text-status-critical">NO</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sdk' && (
          <div className="glass-card p-6 rounded border-white/6 text-left">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4 select-none">
              <div className="flex items-center space-x-2 text-neutral-400">
                <Terminal className="w-4 h-4 text-accent-cyan" />
                <span className="font-mono text-xs font-bold text-neutral-300">PYTHON_SDK_INTEGRATION</span>
              </div>
              <button
                onClick={() => handleCopy(sdkCode)}
                className="flex items-center space-x-2 bg-white/4 border border-white/6 hover:bg-white/8 text-neutral-400 hover:text-white rounded px-2.5 py-1 text-[10px] font-mono font-bold uppercase transition-all select-none cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-status-healthy" /> : <Clipboard className="w-3.5 h-3.5" />}
                <span>{copied ? 'COPIED' : 'COPY_CODE'}</span>
              </button>
            </div>
            
            {/* Custom syntax-highlighted editor box */}
            <div className="p-4 bg-black/80 rounded border border-white/4 font-mono text-[11px] overflow-x-auto text-left whitespace-pre select-all custom-scrollbar leading-relaxed">
              {/* Highlight imports */}
              <span className="text-status-critical">import</span> requests{"\n"}
              <span className="text-status-critical">import</span> time{"\n"}
              <span className="text-status-critical">import</span> random{"\n\n"}
              <span className="text-neutral-500"># Initialize DevPulse Client Credentials</span>{"\n"}
              API_KEY = <span className="text-status-healthy">"{service.api_key}"</span>{"\n"}
              ENDPOINT = <span className="text-status-healthy">"http://localhost:8000/metrics/ingest"</span>{"\n\n"}
              headers = {"{"}{"\n"}
              {"    "}<span className="text-status-healthy">"X-API-Key"</span>: API_KEY,{"\n"}
              {"    "}<span className="text-status-healthy">"Content-Type"</span>: <span className="text-status-healthy">"application/json"</span>{"\n"}
              {"}"}{"\n\n"}
              <span className="text-status-critical">def</span> <span className="text-accent-cyan">report_health</span>():{"\n"}
              {"    "}payload = {"{"}{"\n"}
              {"        "}<span className="text-status-healthy">"service_id"</span>: <span className="text-status-healthy">"{service.id}"</span>,{"\n"}
              {"        "}<span className="text-status-healthy">"metric_type"</span>: <span className="text-status-healthy">"cpu"</span>, <span className="text-neutral-500"># cpu, memory, error_rate, response_time, custom</span>{"\n"}
              {"        "}<span className="text-status-healthy">"value"</span>: round(random.uniform(<span className="text-status-warning">20.0</span>, <span className="text-status-warning">85.0</span>), <span className="text-status-warning">2</span>),{"\n"}
              {"        "}<span className="text-status-healthy">"metadata"</span>: {"{"}{"\n"}
              {"            "}<span className="text-status-healthy">"environment"</span>: <span className="text-status-healthy">"production"</span>,{"\n"}
              {"            "}<span className="text-status-healthy">"host_id"</span>: <span className="text-status-healthy">"aws-node-prod-1a"</span>{"\n"}
              {"        "}{"}"}{"\n"}
              {"    "}{"}"}{"\n\n"}
              {"    "}<span className="text-status-critical">try</span>:{"\n"}
              {"        "}response = requests.post(ENDPOINT, json=payload, headers=headers){"\n"}
              {"        "}<span className="text-status-critical">if</span> response.status_code == <span className="text-status-warning">201</span>:{"\n"}
              {"            "}print(<span className="text-status-healthy">"Telemetry reporting success."</span>){"\n"}
              {"        "}<span className="text-status-critical">else</span>:{"\n"}
              {"            "}print(f<span className="text-status-healthy">"Error: Status code {"{"}response.status_code{"}"}"</span>){"\n"}
              {"    "}<span className="text-status-critical">except</span> Exception <span className="text-status-critical">as</span> e:{"\n"}
              {"        "}print(f<span className="text-status-healthy">"Connection failed: {"{"}e{"}"}"</span>){"\n\n"}
              <span className="text-status-critical">if</span> __name__ == <span className="text-status-healthy">"__main__"</span>:{"\n"}
              {"    "}<span className="text-status-critical">while</span> <span className="text-status-warning">True</span>:{"\n"}
              {"        "}report_health(){"\n"}
              {"        "}time.sleep(<span className="text-status-warning">5</span>)  <span className="text-neutral-500"># Report metrics every 5 seconds</span>
            </div>
          </div>
        )}
      </div>

    </motion.div>
  )
}

export default ServiceDetail
