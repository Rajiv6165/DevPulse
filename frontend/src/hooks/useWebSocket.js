import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'

export const useWebSocket = () => {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  
  const token = useStore((state) => state.token);
  const setWsConnected = useStore((state) => state.setWsConnected);
  const updateTelemetry = useStore((state) => state.updateTelemetry);
  const addAlert = useStore((state) => state.addAlert);
  const addIncident = useStore((state) => state.addIncident);
  const addLog = useStore((state) => state.addLog);
  const addToast = useStore((state) => state.addToast);

  const connect = useCallback(() => {
    // Clean up existing connections
    if (wsRef.current) {
      wsRef.current.close();
    }

    if (!token) {
      setWsConnected(false);
      return;
    }

    if (token === 'demo_jwt_token_key_devpulse') {
      setWsConnected(false);
      return;
    }

    // Load WS base URL from environment (default fallback to window host)
    const baseWsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws/live`;
    const wsUrl = `${baseWsUrl}?token=${token}`;

    console.log(`[WebSocket] Connecting to: ${baseWsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connection established.');
      setWsConnected(true);
      reconnectAttemptsRef.current = 0;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { event: eventType, data } = payload;

        if (eventType === 'metrics') {
          if (Array.isArray(data)) {
            data.forEach((metric) => {
              updateTelemetry(
                metric.service_id,
                metric.metric_type,
                metric.value,
                metric.timestamp
              );
            });
          }
        } else if (eventType === 'alert') {
          addAlert(data);
          addLog({
            level: data.severity === 'critical' ? 'ERROR' : 'WARN',
            message: `[Alert Triggered] ${data.message}`,
            timestamp: data.created_at
          });
          
          const isPredictive = data.message.includes('predicted') || data.message.includes(' trajectory') || data.message.includes('⏱️');
          if (isPredictive) {
            addToast({
              title: "⏱️ Predictive Warning",
              message: data.message,
              type: "predictive"
            });
          } else {
            addToast({
              title: data.severity === 'critical' ? "🔴 Critical Alert" : "🟡 Warning Alert",
              message: data.message,
              type: "anomaly"
            });
          }
        } else if (eventType === 'incident') {
          addIncident(data);
          addLog({
            level: 'ERROR',
            message: `[Incident Formed] ${data.summary}`,
            timestamp: data.started_at
          });
          addToast({
            title: "🔗 Incident Grouped",
            message: data.summary,
            type: "incident"
          });
        } else if (eventType === 'log') {
          addLog(data);
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onclose = (e) => {
      console.log(`[WebSocket] Connection closed (code: ${e.code}). Attempting reconnect...`);
      setWsConnected(false);
      
      // Implement exponential backoff for reconnections (cap at 30 seconds)
      const backoff = Math.min(30000, Math.pow(2, reconnectAttemptsRef.current) * 1000);
      reconnectAttemptsRef.current += 1;
      
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, backoff);
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Socket error observed:', err);
      ws.close();
    };
  }, [token, setWsConnected, updateTelemetry, addAlert, addLog]);

  useEffect(() => {
    if (token !== 'demo_jwt_token_key_devpulse') return;

    // 1. Log simulation: every 3 seconds
    const logInterval = setInterval(() => {
      const services = useStore.getState().services;
      if (services.length === 0) return;
      const randomService = services[Math.floor(Math.random() * services.length)].name;
      const logOptions = [
        { level: 'INFO', message: `[${randomService}] Handled incoming request: GET /health - 200 OK` },
        { level: 'DEBUG', message: `[${randomService}] Cache hit ratio: 89.2%` },
        { level: 'INFO', message: `[${randomService}] Database query resolved in 14.2ms` },
        { level: 'WARN', message: `[${randomService}] Slow query execution detected on index matching.` },
        { level: 'DEBUG', message: `[${randomService}] Cleaned idle connection pool channels.` },
        { level: 'INFO', message: `[${randomService}] Ingested payload from microservice consumer.` }
      ];
      const selectedLog = logOptions[Math.floor(Math.random() * logOptions.length)];
      addLog({
        level: selectedLog.level,
        message: selectedLog.message,
        timestamp: new Date()
      });
    }, 3000);

    // 2. Metrics simulation: every 10 seconds
    const metricInterval = setInterval(() => {
      const services = useStore.getState().services;
      if (services.length === 0) return;

      const mTypes = ['cpu', 'memory', 'error_rate', 'response_time'];
      const now = new Date();

      services.forEach(service => {
        mTypes.forEach(mType => {
          const latestMetrics = useStore.getState().latestMetrics;
          const currentVal = latestMetrics[service.id]?.[mType];
          let value = 0;

          if (mType === 'cpu') {
            const base = currentVal !== undefined ? currentVal : 45;
            value = Math.max(10, Math.min(95, base + (Math.random() - 0.5) * 4));
          } else if (mType === 'memory') {
            const base = currentVal !== undefined ? currentVal : 60;
            value = Math.max(20, Math.min(90, base + (Math.random() - 0.5) * 2));
          } else if (mType === 'error_rate') {
            const base = currentVal !== undefined ? currentVal : 0.5;
            value = Math.random() < 0.05 ? Math.random() * 4 : Math.max(0, Math.min(2, base + (Math.random() - 0.5) * 0.1));
          } else if (mType === 'response_time') {
            const base = currentVal !== undefined ? currentVal : 120;
            value = Math.max(30, Math.min(800, base + (Math.random() - 0.5) * 15));
          }

          updateTelemetry(service.id, mType, value, now);
        });
      });
    }, 10000);

    // 3. Alerts/Incidents simulation: every 30 seconds
    const alertInterval = setInterval(() => {
      const services = useStore.getState().services;
      if (services.length === 0) return;

      const randomService = services[Math.floor(Math.random() * services.length)];
      const isCritical = Math.random() < 0.35;
      const alertId = `mock-alert-${Math.random().toString(36).substr(2, 9)}`;
      
      const messages = [
        `High error rate detected on ${randomService.name}: threshold breach.`,
        `CPU usage spiked to 94% on ${randomService.name}, Z-score: 3.1.`,
        `Response time threshold warning on ${randomService.name} - GET /api/v1/data (520ms).`,
        `Memory usage exceeded 85% safety threshold on ${randomService.name}.`
      ];
      
      const message = messages[Math.floor(Math.random() * messages.length)];
      const severity = isCritical ? 'critical' : 'medium';
      
      addAlert({
        id: alertId,
        service_id: randomService.id,
        severity,
        message,
        is_resolved: false,
        created_at: new Date().toISOString()
      });

      addLog({
        level: severity === 'critical' ? 'ERROR' : 'WARN',
        message: `[Alert Triggered] ${message}`,
        timestamp: new Date()
      });

      addToast({
        title: severity === 'critical' ? "🔴 Critical Alert" : "🟡 Warning Alert",
        message,
        type: "anomaly"
      });

      if (Math.random() < 0.3) {
        const incidentId = `mock-inc-${Math.random().toString(36).substr(2, 9)}`;
        const affectedService = services.find(s => s.id !== randomService.id) || randomService;
        const incSummary = `Grouped incident: ${randomService.name} degraded. Downstream impact detected on ${affectedService.name}.`;
        
        addIncident({
          id: incidentId,
          root_cause_service_id: randomService.id,
          root_cause_service_name: randomService.name,
          affected_service_ids: [affectedService.id],
          started_at: new Date().toISOString(),
          resolved_at: null,
          summary: incSummary
        });

        addLog({
          level: 'ERROR',
          message: `[Incident Formed] ${incSummary}`,
          timestamp: new Date()
        });

        addToast({
          title: "🔗 Incident Grouped",
          message: incSummary,
          type: "incident"
        });
      }
    }, 30000);

    return () => {
      clearInterval(logInterval);
      clearInterval(metricInterval);
      clearInterval(alertInterval);
    };
  }, [token, addLog, updateTelemetry, addAlert, addToast, addIncident]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Return trigger function in case pages want to force reconnects manually
  return { reconnect: connect };
};
