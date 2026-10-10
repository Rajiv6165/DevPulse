import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Terminal, Shield, ArrowRight, Eye, EyeOff } from 'lucide-react'

export const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showBypassHint, setShowBypassHint] = useState(false)

  const loginStore = useStore((state) => state.login)
  const navigate = useNavigate()

  // --- TERMINAL LOG STREAM SIMULATION ---
  const [terminalLogs, setTerminalLogs] = useState([])
  const terminalEndRef = useRef(null)

  useEffect(() => {
    // Scaffold initial logs
    setTerminalLogs([
      { level: 'INFO', msg: 'System initialization sequence started...', time: '16:44:02' },
      { level: 'INFO', msg: 'Core networking bind successful (0.0.0.0:8000)', time: '16:44:03' },
      { level: 'DEBUG', msg: 'Preloading anomaly models: isolation_forest', time: '16:44:03' },
      { level: 'INFO', msg: 'FastAPI router mapping completed successfully.', time: '16:44:04' },
      { level: 'WARN', msg: 'Supabase client running in direct SSL pool override mode.', time: '16:44:05' },
    ])

    const interval = setInterval(() => {
      setTerminalLogs(prev => {
        if (prev.length >= 19) {
          clearInterval(interval);
          if (prev.length === 19) {
            return [...prev, { level: 'INFO', msg: 'System ready. Awaiting authentication...', time: new Date().toLocaleTimeString() }];
          }
          return prev;
        }

        const msgs = [
          { level: 'INFO', msg: 'Ingesting CPU payload from microservice: gateway-api' },
          { level: 'DEBUG', msg: 'Redis cache hit for service schema validation' },
          { level: 'INFO', msg: 'Sliding window metric pushed: cpu=42.1% (z=0.42)' },
          { level: 'INFO', msg: 'Ingesting memory payload from service: payment-processor' },
          { level: 'DEBUG', msg: 'Computing Z-score anomaly on window length=100' },
          { level: 'INFO', msg: 'Sliding window metric pushed: memory=65.2% (z=0.18)' },
          { level: 'WARN', msg: 'Latency threshold near warning values on gateway-api (320ms)' },
          { level: 'INFO', msg: 'Scheduled hourly S3 log archiver check complete. 0 logs purged.' },
        ]
        
        const isError = Math.random() < 0.05
        let newLog
        if (isError) {
          newLog = { 
            level: 'ERROR', 
            msg: 'Anomaly detected in response_time: value 1250ms (Z-Score: 3.12) -> Triggering Alerts!',
            time: new Date().toLocaleTimeString()
          }
        } else {
          const rand = msgs[Math.floor(Math.random() * msgs.length)]
          newLog = { 
            level: rand.level, 
            msg: rand.msg, 
            time: new Date().toLocaleTimeString()
          }
        }

        return [...prev, newLog]
      })
    }, 1500)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [terminalLogs])

  // --- FORM HANDLERS ---
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setShowBypassHint(false)

    if (!email || !password) {
      setError('Please fill in all fields')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const contentType = response.headers.get("content-type")
      if (!response.ok || !contentType || !contentType.includes("application/json")) {
        throw new Error("Backend not connected. Please use BYPASS_DEMO_MODE to explore the dashboard.")
      }

      const data = await response.json()
      loginStore(data.access_token)
      navigate('/dashboard')
    } catch (err) {
      let errorMessage = err.message;
      if (
        errorMessage.includes("JSON") || 
        errorMessage.includes("Unexpected token") || 
        errorMessage.includes("Failed to fetch") || 
        errorMessage.includes("NetworkError") ||
        errorMessage === "Backend not connected. Please use BYPASS_DEMO_MODE to explore the dashboard."
      ) {
        errorMessage = "Backend not connected. Please use BYPASS_DEMO_MODE to explore the dashboard.";
        setShowBypassHint(true);
      }
      
      setError(errorMessage || 'Server connection failed')
    } finally {
      setLoading(false)
    }
  }

  // --- DEMO BYPASS HANDLER ---
  const handleDemoMode = () => {
    // Initialize demo data
    useStore.getState().initializeDemoData()
    // Generate dummy token to authenticate instantly
    loginStore('demo_jwt_token_key_devpulse')
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen w-screen flex bg-background relative overflow-hidden select-none">
      
      {/* 1. LEFT PANEL: Scrolling logs console (Visible on md+) */}
      <div className="hidden md:flex md:w-1/2 bg-black/60 border-r border-white/6 flex-col p-8 font-mono text-[11px] leading-relaxed relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,245,255,0.02),transparent)] pointer-events-none" />
        
        {/* Console Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/6 mb-6 select-none">
          <div className="flex items-center space-x-2 text-neutral-400">
            <Terminal className="w-4 h-4 text-accent-cyan" />
            <span className="font-bold tracking-widest text-neutral-300">DEVPULSE_TELEMETRY_LOGS</span>
          </div>
          <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">LIVE_STREAM</span>
        </div>

        {/* Scrollable logs list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-end text-left pr-2">
          {terminalLogs.map((log, i) => (
            <div key={i} className="mb-1 py-0.5 border-b border-white/[0.01] flex items-start space-x-2">
              <span className="text-neutral-600 select-none">{log.time || '16:44'}</span>
              <span className={`px-1 rounded text-[8px] font-bold ${
                log.level === 'ERROR' ? 'bg-status-critical/10 text-status-critical' :
                log.level === 'WARN' ? 'bg-status-warning/10 text-status-warning' :
                log.level === 'DEBUG' ? 'bg-white/5 text-neutral-500' : 'bg-accent-cyan/10 text-accent-cyan'
              }`}>
                {log.level}
              </span>
              <span className="text-neutral-300 select-all font-mono break-all">{log.msg}</span>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* 2. RIGHT PANEL: Authentication Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,245,255,0.02),transparent)] pointer-events-none" />

        <div className="w-full max-w-sm flex flex-col">
          {/* Brand Logo Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-10 h-10 bg-white/3 border border-white/8 rounded flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(255,255,255,0.02)]">
              <Shield className="w-5 h-5 text-accent-cyan" />
            </div>
            <h1 className="font-mono text-xl font-bold text-white tracking-widest uppercase">
              DEV<span className="text-accent-cyan">PULSE</span>
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mt-1">
              AI-Powered Observability
            </p>
          </div>

          {/* Form Card */}
          <div className="glass-card p-6 rounded border-white/6 shadow-2xl relative">
            <h2 className="text-sm font-semibold text-white uppercase tracking-widest mb-6 text-left border-b border-white/5 pb-2">
              SIGN_IN
            </h2>

            {error && (
              <div className="bg-status-critical/10 border border-status-critical/20 text-status-critical px-3 py-2 rounded text-xs text-left mb-4 font-mono font-medium">
                ERROR: {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-1.5 select-none">
                  EMAIL_ADDRESS
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@devpulse.com"
                  className="w-full bg-white/3 border border-white/6 rounded px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-accent-cyan/40 transition-all font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-widest text-neutral-400 font-bold mb-1.5 select-none">
                  PASSWORD
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/3 border border-white/6 rounded px-3 py-2 pr-9 text-xs text-white placeholder-neutral-600 outline-none focus:border-accent-cyan/40 transition-all font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-neutral-600 hover:text-neutral-400 select-none cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* High Contrast Flat Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent-cyan text-black hover:bg-white hover:text-black font-mono font-bold text-xs uppercase py-2.5 rounded tracking-widest transition-all duration-300 flex items-center justify-center space-x-2 select-none cursor-pointer mt-6"
              >
                <span>{loading ? 'SIGNING_IN...' : 'SIGN_IN'}</span>
                {!loading && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </form>

            {/* Quick Demo Mode Bypass */}
            <button
              onClick={handleDemoMode}
              className={`w-full font-mono font-bold text-[10px] uppercase py-2 rounded tracking-widest transition-all select-none cursor-pointer mt-3 border ${
                showBypassHint 
                  ? 'bg-accent-cyan/10 border-accent-cyan text-accent-cyan shadow-[0_0_15px_rgba(0,245,255,0.4)] animate-pulse' 
                  : 'bg-white/4 border-white/8 text-neutral-300 hover:text-white hover:bg-white/8'
              }`}
            >
              BYPASS_DEMO_MODE
            </button>
          </div>

          <p className="text-center text-xs text-neutral-500 mt-6 select-none font-mono">
            No account?{' '}
            <Link to="/register" className="text-accent-cyan hover:text-white transition-all font-bold">
              CREATE_ACCOUNT
            </Link>
          </p>
        </div>
      </div>

    </div>
  )
}

export default Login
