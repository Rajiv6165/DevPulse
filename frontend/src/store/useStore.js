import { create } from 'zustand'

// Helper to load token from localStorage
const getStoredToken = () => localStorage.getItem('devpulse_token') || null

// Initial dummy logs for the live terminal log stream
const initialLogs = [
  { id: 'log-init-1', level: 'INFO', message: 'System initialization sequence triggered...', timestamp: new Date() },
  { id: 'log-init-2', level: 'DEBUG', message: 'Configured connection pool: min=5, max=20', timestamp: new Date() },
  { id: 'log-init-3', level: 'INFO', message: 'Supabase client database connection established.', timestamp: new Date() },
  { id: 'log-init-4', level: 'INFO', message: 'Upstash Redis stream consumer group registered: anomaly-workers', timestamp: new Date() },
  { id: 'log-init-5', level: 'DEBUG', message: 'Background worker active. Listening on stream: devpulse:metrics:stream', timestamp: new Date() },
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
  clearLogs: () => set({ logs: [] }),
  addLog: (logLine) => {
    set((state) => {
      const newLog = {
        id: logLine.id || `log-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`,
        level: logLine.level || 'INFO',
        message: logLine.message,
        timestamp: logLine.timestamp ? new Date(logLine.timestamp) : new Date()
      }
      const updatedLogs = [...state.logs, newLog]
      
      // Cap terminal log stream lines to prevent browser lags
      if (updatedLogs.length > 100) {
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
    const currentTime = Date.now();
    // Throttle to every 9000ms (between 8-10s)
    if (!get().lastMockLogTime || currentTime - get().lastMockLogTime >= 9000) {
      set({ lastMockLogTime: currentTime });
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
  },

  // --- DEMO INITIALIZATION ---
  initializeDemoData: () => {
    const services = [
      { id: 'srv-auth-1', name: 'auth-service' },
      { id: 'srv-db-2', name: 'db-pool-manager' },
      { id: 'srv-gateway-3', name: 'api-gateway' },
      { id: 'srv-payments-4', name: 'payment-processor' }
    ].map(s => ({
      id: s.id,
      name: s.name,
      description: `Microservice managing ${s.name.split('-')[0]} operations.`,
      api_key: `dp_mock_${s.id}`,
      owner_id: 'user-1',
      created_at: new Date().toISOString(),
      is_active: true
    }));

    const historicalMetrics = {};
    const latestMetrics = {};
    const now = new Date();

    services.forEach(service => {
      historicalMetrics[service.id] = {
        cpu: [],
        memory: [],
        error_rate: [],
        response_time: []
      };

      latestMetrics[service.id] = {};

      const mTypes = ['cpu', 'memory', 'error_rate', 'response_time'];
      mTypes.forEach(mType => {
        let baseVal = 30;
        if (mType === 'cpu') baseVal = 45;
        else if (mType === 'memory') baseVal = 60;
        else if (mType === 'error_rate') baseVal = 0.5;
        else if (mType === 'response_time') baseVal = 120;

        for (let i = 20; i >= 0; i--) {
          const timestamp = new Date(now.getTime() - i * 15000); // spaced 15s apart
          let val = baseVal;
          if (mType === 'cpu') val = Math.max(10, Math.min(95, baseVal + (Math.random() - 0.5) * 15));
          else if (mType === 'memory') val = Math.max(20, Math.min(90, baseVal + (Math.random() - 0.5) * 8));
          else if (mType === 'error_rate') val = Math.random() < 0.08 ? Math.random() * 5 : Math.max(0, Math.min(1.5, baseVal + (Math.random() - 0.5) * 0.3));
          else if (mType === 'response_time') val = Math.max(30, Math.min(800, baseVal + (Math.random() - 0.5) * 60));

          historicalMetrics[service.id][mType].push({
            timestamp,
            value: parseFloat(val.toFixed(2))
          });

          if (i === 0) {
            latestMetrics[service.id][mType] = parseFloat(val.toFixed(2));
            latestMetrics[service.id].last_updated = now;
          }
        }
      });
    });

    const mockAlerts = [
      {
        id: 'mock-alert-1',
        service_id: 'srv-db-2',
        severity: 'critical',
        message: 'Database connection pool utilization reached 94% on db-pool-manager.',
        is_resolved: false,
        created_at: new Date(now.getTime() - 5 * 60000).toISOString()
      },
      {
        id: 'mock-alert-2',
        service_id: 'srv-payments-4',
        severity: 'medium',
        message: 'Latency spike on GET /charge endpoint: 420ms (Z-Score: 2.15).',
        is_resolved: false,
        created_at: new Date(now.getTime() - 2 * 60000).toISOString()
      }
    ];

    const mockIncidents = [
      {
        id: 'mock-inc-1',
        root_cause_service_id: 'srv-db-2',
        root_cause_service_name: 'db-pool-manager',
        affected_service_ids: ['srv-payments-4', 'srv-auth-1'],
        started_at: new Date(now.getTime() - 10 * 60000).toISOString(),
        resolved_at: null,
        summary: 'Grouped incident: db-pool-manager exhausted connection capacity. Downstream impacts observed on payment-processor and auth-service.'
      }
    ];

    set({
      services,
      historicalMetrics,
      latestMetrics,
      alerts: mockAlerts,
      incidents: mockIncidents,
      wsConnected: false
    });
  }
}))
