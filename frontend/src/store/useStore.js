import { create } from 'zustand'

// Helper to load token from localStorage
const getStoredToken = () => localStorage.getItem('devpulse_token') || null

// Initial dummy logs for the live terminal log stream
const initialLogs = [
  { level: 'INFO', message: 'System initialization sequence triggered...', timestamp: new Date() },
  { level: 'DEBUG', message: 'Configured connection pool: min=5, max=20', timestamp: new Date() },
  { level: 'INFO', message: 'Supabase client database connection established.', timestamp: new Date() },
  { level: 'INFO', message: 'Upstash Redis stream consumer group registered: anomaly-workers', timestamp: new Date() },
  { level: 'DEBUG', message: 'Background worker active. Listening on stream: devpulse:metrics:stream', timestamp: new Date() },
]

export const useStore = create((set, get) => ({
  // --- AUTHENTICATION STATE ---
  token: getStoredToken(),
  user: null,
  login: (token) => {
    localStorage.setItem('devpulse_token', token)
    set({ token })
  },
  logout: () => {
    localStorage.removeItem('devpulse_token')
    set({ token: null, user: null, services: [], alerts: [], currentServiceId: 'all' })
  },
  setUser: (user) => set({ user }),

  // --- SERVICE CONFIGURATIONS ---
  services: [],
  currentServiceId: 'all',
  setServices: (services) => {
    set({ services })
    if (services.length > 0 && get().currentServiceId === 'all') {
      // Don't auto-force to first service unless preferred
    }
  },
  setCurrentServiceId: (id) => set({ currentServiceId: id }),

  // --- TELEMETRY & METRICS STORE ---
  // Structure: { [serviceId]: { cpu: [], memory: [], error_rate: [], response_time: [] } }
  historicalMetrics: {},
  latestMetrics: {}, // { [serviceId]: { cpu: value, memory: value, ... } }
  
  updateTelemetry: (serviceId, metricType, value, timestamp) => {
    set((state) => {
      const serviceHistory = state.historicalMetrics[serviceId] || {
        cpu: [],
        memory: [],
        error_rate: [],
        response_time: [],
      }
      
      const updatedList = [...(serviceHistory[metricType] || [])]
      updatedList.push({ timestamp: new Date(timestamp), value: parseFloat(value) })
      
      // Cap individual chart history to last 30 data points
      if (updatedList.length > 30) {
        updatedList.shift()
      }
      
      const newHistory = {
        ...state.historicalMetrics,
        [serviceId]: {
          ...serviceHistory,
          [metricType]: updatedList
        }
      }
      
      const newLatest = {
        ...state.latestMetrics,
        [serviceId]: {
          ...(state.latestMetrics[serviceId] || {}),
          [metricType]: parseFloat(value),
          last_updated: new Date()
        }
      }
      
      return {
        historicalMetrics: newHistory,
        latestMetrics: newLatest
      }
    })
  },

  // --- ALERTS & ANOMALIES FEED ---
  alerts: [],
  anomalies: [],
  incidents: [],
  setAlerts: (alerts) => set({ alerts }),
  setAnomalies: (anomalies) => set({ anomalies }),
  setIncidents: (incidents) => set({ incidents }),
  
  addIncident: (incident) => {
    set((state) => {
      if (state.incidents.some(i => i.id === incident.id)) return {}
      return { incidents: [incident, ...state.incidents] }
    })
  },
  
  resolveIncidentOptimistic: (incidentId) => {
    set((state) => ({
      incidents: state.incidents.map(i =>
        i.id === incidentId ? { ...i, resolved_at: new Date().toISOString() } : i
      )
    }))
  },
  
  addAlert: (alert) => {
    set((state) => {
      // Prevent duplicates
      if (state.alerts.some(a => a.id === alert.id)) return {}
      
      // Append to the beginning
      const updated = [alert, ...state.alerts]
      
      // Play audio chime if critical and enabled
      if (alert.severity === 'critical' && state.soundEnabled) {
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-120.wav')
          audio.volume = 0.3
          audio.play().catch(() => {})
        } catch (e) {
          // Playback blocked by browser
        }
      }
      
      return { alerts: updated }
    })
  },

  addAnomaly: (anomaly) => set((state) => ({
    anomalies: [anomaly, ...state.anomalies].slice(0, 100) // Keep latest 100 anomalies
  })),

  // Optimistic UI updates for resolving alerts
  resolveAlertOptimistic: (alertId) => {
    set((state) => ({
      alerts: state.alerts.map(a => 
        a.id === alertId ? { ...a, is_resolved: true, resolved_at: new Date().toISOString() } : a
      )
    }))
  },

  // --- LIVE CONSOLE STREAM LOGGER ---
  logs: initialLogs,
  addLog: (logLine) => {
    set((state) => {
      const updatedLogs = [...state.logs, {
        level: logLine.level || 'INFO',
        message: logLine.message,
        timestamp: logLine.timestamp ? new Date(logLine.timestamp) : new Date()
      }]
      
      // Cap terminal log stream lines to prevent browser lags
      if (updatedLogs.length > 150) {
        updatedLogs.shift()
      }
      return { logs: updatedLogs }
    })
  },

  // --- WS STATUS & TELEMETRY TOGGLES ---
  wsConnected: false,
  setWsConnected: (status) => set({ wsConnected: status }),
  
  soundEnabled: true,
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
  
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substr(2, 9)
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }))
    }, 5000)
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),


  // --- DEMO MOCK METRIC INJECTOR ---
  // Runs automatically to showcase breathing animations and charts when WS is disconnected
  generateMockTelemetry: () => {
    const services = get().services.length > 0 
      ? get().services 
      : [
          { id: 'srv-auth-1', name: 'auth-service' },
          { id: 'srv-db-2', name: 'db-pool-manager' },
          { id: 'srv-gateway-3', name: 'api-gateway' },
          { id: 'srv-payments-4', name: 'payment-processor' }
        ]
        
    // If services array was empty, update it so select dropdowns and cards display them
    if (get().services.length === 0) {
      set({
        services: services.map(s => ({
          id: s.id,
          name: s.name,
          description: `Microservice managing ${s.name.split('-')[0]} operations.`,
          api_key: `dp_mock_${s.id}`,
          owner_id: 'user-1',
          created_at: new Date().toISOString(),
          is_active: true
        }))
      })
    }

    const mTypes = ['cpu', 'memory', 'error_rate', 'response_time']
    
    // Choose a random service and inject a point
    services.forEach(service => {
      mTypes.forEach(mType => {
        let value = 0
        const now = new Date()
        
        // Generate realistic values
        if (mType === 'cpu') value = Math.max(10, Math.min(95, (get().latestMetrics[service.id]?.cpu || 35) + (Math.random() - 0.5) * 8))
        else if (mType === 'memory') value = Math.max(20, Math.min(90, (get().latestMetrics[service.id]?.memory || 55) + (Math.random() - 0.5) * 4))
        else if (mType === 'error_rate') value = Math.random() < 0.05 ? Math.random() * 8 : Math.max(0, Math.min(2, (get().latestMetrics[service.id]?.error_rate || 0.2) + (Math.random() - 0.5) * 0.4))
        else if (mType === 'response_time') value = Math.max(30, Math.min(800, (get().latestMetrics[service.id]?.response_time || 120) + (Math.random() - 0.5) * 40))

        get().updateTelemetry(service.id, mType, value, now)
      })
    })

    // Random log line injection
    const randomService = services[Math.floor(Math.random() * services.length)].name
    const logOptions = [
      { level: 'INFO', message: `[${randomService}] Handled incoming request: GET /health - 200 OK` },
      { level: 'DEBUG', message: `[${randomService}] Cache hit ratio: 89.2%` },
      { level: 'INFO', message: `[${randomService}] Database query resolved in 14.2ms` },
      { level: 'WARN', message: `[${randomService}] Slow query execution detected on index matching.` },
      { level: 'DEBUG', message: `[${randomService}] Cleaned idle connection pool channels.` },
    ]
    
    const isError = Math.random() < 0.05
    if (isError) {
      get().addLog({ level: 'ERROR', message: `[${randomService}] Error: Failed connection handshake to Redis client!` })
      // Spawn mock alert
      const alertId = `mock-alert-${Math.random().toString(36).substr(2, 9)}`
      const randomServiceId = services[Math.floor(Math.random() * services.length)].id
      const actualMessage = `CPU usage hit 94%, which is 3.2x higher than typical 29% seen at this hour. This pattern matches sudden spike.`
      
      get().addAlert({
        id: alertId,
        service_id: randomServiceId,
        severity: Math.random() < 0.3 ? 'critical' : 'medium',
        message: actualMessage,
        is_resolved: false,
        created_at: new Date().toISOString()
      })
      
      // Spawn mock incident
      const incidentId = `mock-inc-${Math.random().toString(36).substr(2, 9)}`
      const affectedService = services[Math.floor(Math.random() * services.length)]
      get().addIncident({
        id: incidentId,
        root_cause_service_id: randomServiceId,
        root_cause_service_name: randomService,
        affected_service_ids: [affectedService.id],
        started_at: new Date().toISOString(),
        resolved_at: null,
        summary: `Grouped incident: ${randomService} degraded. Downstream impact detected on ${affectedService.name}.`
      })
    } else {
      get().addLog(logOptions[Math.floor(Math.random() * logOptions.length)])
    }
  }
}))
