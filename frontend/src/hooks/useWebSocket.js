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
