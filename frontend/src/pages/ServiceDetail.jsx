import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, LogOut, Terminal, Clipboard, Check, Activity, ShieldAlert, Cpu, HardDrive, Percent, Clock } from 'lucide-react'
import { useStore } from '../store/useStore'
import ConnectionStatus from '../components/ConnectionStatus'
import MetricChart from '../components/MetricChart'
import SeverityBadge from '../components/SeverityBadge'

export const ServiceDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()

  const token = useStore((state) => state.token)
  const logout = useStore((state) => state.logout)
  const services = useStore((state) => state.services)
  const historicalMetrics = useStore((state) => state.historicalMetrics)
  const alerts = useStore((state) => state.alerts)

  const [timeframe, setTimeframe] = useState('1h')
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState('metrics') // 'metrics' | 'timeline' | 'sdk'

  // Redirect if unauthenticated
  useEffect(() => {
    if (!token) navigate('/login')
  }, [token, navigate])

  const service = services.find((s) => s.id === id)
  if (!service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background font-mono text-xs">
        <p className="text-status-critical">ERROR: SERVICE_NOT_FOUND_OR_ACCESS_DENIED</p>
      </div>
    )
  }

  // Load telemetry metrics lists
  const serviceHistory = historicalMetrics[id] || {
    cpu: [],
    memory: [],
    error_rate: [],
    response_time: [],
  }

  // Filter alerts for this service
  const serviceAlerts = alerts.filter((a) => a.service_id === id)

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // --- MOCK ANOMALIES TIMELINE DATA ---
  const timelinePoints = [
    { time: '10 mins ago', label: 'CPU spike', severity: 'medium', score: 3.2 },
    { time: '28 mins ago', label: 'Latency timeout', severity: 'critical', score: 4.8 },
    { time: '45 mins ago', label: 'Memory leak warning', severity: 'low', score: 2.6 },
  ]

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
            <MetricChart data={serviceHistory.cpu} title="CPU_LOAD" color="#00F5FF" yUnit="%" />
            <MetricChart data={serviceHistory.memory} title="MEMORY_RESERVE" color="#10B981" yUnit="%" />
            <MetricChart data={serviceHistory.error_rate} title="ERROR_RATES" color="#F43F5E" yUnit="%" />
            <MetricChart data={serviceHistory.response_time} title="RESPONSE_LATENCY" color="#F59E0B" yUnit="ms" />
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-6">
            {/* Horizontal timeline track */}
            <div className="glass-card p-6 rounded border-white/6 text-left relative overflow-hidden">
              <h3 className="text-xs font-semibold text-white uppercase tracking-widest mb-6">
                Horizontal Anomaly Track (Last 24 Hours)
              </h3>
              
              <div className="h-4 bg-white/3 border border-white/6 rounded-full relative flex items-center mb-8">
                {/* Horizontal time grids */}
                <div className="absolute inset-0 flex justify-between px-6 text-[8px] font-mono text-neutral-600 select-none">
                  <span>-24H</span>
                  <span>-18H</span>
                  <span>-12H</span>
                  <span>-6H</span>
                  <span>NOW</span>
                </div>
                
                {/* Simulated Anomaly flags on track */}
                <div className="absolute left-1/4 w-3.5 h-3.5 bg-status-warning rounded-full border-2 border-[#0A0A0A] shadow-[0_0_8px_#F59E0B] cursor-pointer" title="Z-Score: 2.6" />
                <div className="absolute left-[58%] w-3.5 h-3.5 bg-status-critical rounded-full border-2 border-[#0A0A0A] shadow-[0_0_8px_#F43F5E] cursor-pointer" title="Z-Score: 4.8" />
                <div className="absolute left-[88%] w-3.5 h-3.5 bg-status-warning rounded-full border-2 border-[#0A0A0A] shadow-[0_0_8px_#F59E0B] cursor-pointer" title="Z-Score: 3.2" />
              </div>

              {/* Anomaly list */}
              <div className="space-y-3 font-mono text-xs">
                {timelinePoints.map((pt, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white/2 border border-white/4 rounded">
                    <div className="flex items-center space-x-3">
                      <span className={`w-2 h-2 rounded-full ${pt.severity === 'critical' ? 'bg-status-critical shadow-[0_0_8px_#F43F5E]' : 'bg-status-warning shadow-[0_0_8px_#F59E0B]'}`} />
                      <span className="font-bold text-white uppercase">{pt.label}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-neutral-500">{pt.time.toUpperCase()}</span>
                      <SeverityBadge severity={pt.severity} />
                      <span className="text-accent-cyan font-bold">SCORE: {pt.score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Alert history table */}
            <div className="glass-card p-6 rounded border-white/6 text-left">
              <h3 className="text-xs font-semibold text-white uppercase tracking-widest mb-4">
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
