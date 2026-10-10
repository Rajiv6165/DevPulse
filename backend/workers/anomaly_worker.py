import asyncio
import json

from core.database import get_db_cursor
from core.notifications import dispatch_anomaly_notifications
from core.redis import async_redis_client
from core.websocket_manager import manager
from ml.correlator import IncidentCorrelator
from ml.detector import AnomalyDetector
from ml.explainer import Explainer
from ml.forecaster import Forecaster

# Global shared detector instance
detector = AnomalyDetector()

# Controlled state for clean startup/shutdown
worker_running = True
worker_task = None

async def init_consumer_group():
    """Initializes the Redis stream consumer group if it does not already exist."""
    stream_key = "devpulse:metrics:stream"
    group_name = "anomaly-workers"
    try:
        # Create group and auto-generate stream if missing (mkstream=True)
        await async_redis_client.xgroup_create(
            name=stream_key,
            group=group_name,
            id="$",
            mkstream=True
        )
        print(f"[Worker] Consumer group '{group_name}' created on '{stream_key}'.")
    except Exception as e:
        err_msg = str(e)
        if "BUSYGROUP" in err_msg or "already exists" in err_msg.lower():
            print(f"[Worker] Consumer group '{group_name}' already exists.")
        else:
            print(f"[Worker] Warning while initializing consumer group: {err_msg}")

async def process_metric_message(msg_id: str, payload: dict):
    """Processes a single metric event, scoring it for anomalies."""
    try:
        service_id = payload.get("service_id")
        metric_type = payload.get("metric_type")
        value_str = payload.get("value")
        metric_id = payload.get("metric_id")
        
        if not service_id or not metric_type or value_str is None:
            print(f"[Worker] Invalid message payload: {payload}")
            await async_redis_client.xack("devpulse:metrics:stream", "anomaly-workers", msg_id)
            return

        value = float(value_str)
        
        # 1. Detect Anomaly using the ML AnomalyDetector orchestrator
        res = await detector.detect(service_id, metric_type, value)
        
        # 2. Get history from Redis and run Predictive Forecaster
        history = await detector.zscore_detector.get_timestamped_window(service_id, metric_type)
        forecaster = Forecaster()
        fc_res = forecaster.forecast(metric_type, history)
        
        # 3. Check for Predictive Alert
        if fc_res and fc_res.get("breached"):
            # Generate predictive explanation
            pred_explanation = Explainer.generate_explanation(metric_type, value, res, fc_res)
            print(f"[Worker] Predictive Alert! Service: {service_id}, Metric: {metric_type}, Explanation: {pred_explanation}")
            
            # A. Insert predictive alert to DB
            with get_db_cursor() as cur:
                cur.execute(
                    "INSERT INTO alerts (service_id, metric_id, severity, message, is_resolved, created_at) "
                    "VALUES (%s, %s, %s, %s, FALSE, NOW()) "
                    "RETURNING id, service_id, metric_id, severity, message, is_resolved, created_at",
                    (service_id, metric_id, "medium", pred_explanation)
                )
                pred_alert = cur.fetchone()
            
            # B. Broadcast alert in real-time to active WebSocket client connections
            with get_db_cursor() as cur:
                cur.execute("SELECT owner_id FROM services WHERE id = %s", (service_id,))
                service_record = cur.fetchone()
                
            if service_record:
                owner_id = str(service_record["owner_id"])
                alert_payload = {
                    "id": str(pred_alert["id"]),
                    "service_id": str(pred_alert["service_id"]),
                    "metric_id": str(pred_alert["metric_id"]) if pred_alert["metric_id"] else None,
                    "severity": pred_alert["severity"],
                    "message": pred_alert["message"],
                    "is_resolved": pred_alert["is_resolved"],
                    "created_at": pred_alert["created_at"].isoformat()
                }
                await manager.broadcast_alert(owner_id, alert_payload)

            # C. Dispatch notifications with cooldown (5-min rate limit handled in notifications)
            asyncio.create_task(
                dispatch_anomaly_notifications(
                    service_id=service_id,
                    metric_type=metric_type,
                    value=value,
                    severity="medium",
                    timestamp=pred_alert["created_at"],
                    explanation=pred_explanation,
                    predictive_context=fc_res
                )
            )

        # 4. Check if anomaly was flagged
        if res.is_anomaly:
            print(f"[Worker] Anomaly detected! Service: {service_id}, Metric: {metric_type}, Value: {value}, Confidence: {res.confidence:.2f}")
            
            # A. Insert anomaly record to DB
            context_data = {
                "value": value,
                "confidence": res.confidence,
                "severity": res.severity,
                "contributing_methods": res.contributing_methods,
                "explanation": res.explanation,
                "metric_id": metric_id,
                **res.metadata
            }
            
            with get_db_cursor() as cur:
                cur.execute(
                    "INSERT INTO anomalies (service_id, metric_type, score, detected_at, context) "
                    "VALUES (%s, %s, %s, NOW(), %s::jsonb) "
                    "RETURNING id, service_id, metric_type, score, detected_at, context",
                    (service_id, metric_type, res.confidence, json.dumps(context_data))
                )
                anomaly = cur.fetchone()
                
            # B. Incident correlation
            correlator = IncidentCorrelator()
            incident = correlator.correlate_anomaly(service_id, metric_type, anomaly["detected_at"])
            
            # C. Insert alert record to DB
            alert_message = res.explanation
            if incident:
                alert_message += f" [Part of Incident: {incident['summary']}]"
                
            with get_db_cursor() as cur:
                cur.execute(
                    "INSERT INTO alerts (service_id, metric_id, severity, message, is_resolved, created_at) "
                    "VALUES (%s, %s, %s, %s, FALSE, NOW()) "
                    "RETURNING id, service_id, metric_id, severity, message, is_resolved, created_at",
                    (service_id, metric_id, res.severity, alert_message)
                )
                alert = cur.fetchone()
                
            # D. Broadcast alert in real-time to active WebSocket client connections
            with get_db_cursor() as cur:
                cur.execute("SELECT owner_id FROM services WHERE id = %s", (service_id,))
                service_record = cur.fetchone()
                
            if service_record:
                owner_id = str(service_record["owner_id"])
                alert_payload = {
                    "id": str(alert["id"]),
                    "service_id": str(alert["service_id"]),
                    "metric_id": str(alert["metric_id"]) if alert["metric_id"] else None,
                    "severity": alert["severity"],
                    "message": alert["message"],
                    "is_resolved": alert["is_resolved"],
                    "created_at": alert["created_at"].isoformat()
                }
                await manager.broadcast_alert(owner_id, alert_payload)

            # E. Dispatch notifications
            asyncio.create_task(
                dispatch_anomaly_notifications(
                    service_id=service_id,
                    metric_type=metric_type,
                    value=value,
                    severity=res.severity,
                    timestamp=alert["created_at"],
                    explanation=res.explanation,
                    incident_context=incident
                )
            )

        # 5. Acknowledge processed stream item
        await async_redis_client.xack("devpulse:metrics:stream", "anomaly-workers", msg_id)

    except Exception as e:
        print(f"[Worker] Error processing message {msg_id}: {e}")

async def run_anomaly_worker():
    """Main worker loop pulling from Upstash Redis stream."""
    print("[Worker] Starting anomaly detection stream consumer...")
    await init_consumer_group()
    
    stream_key = "devpulse:metrics:stream"
    group_name = "anomaly-workers"
    consumer_name = "worker-node-1"
    
    while worker_running:
        try:
            # Poll Redis stream. Wait up to 500ms for new messages
            streams = {stream_key: ">"}
            response = await async_redis_client.xread_group(
                groupname=group_name,
                consumername=consumer_name,
                streams=streams,
                count=10,
                block=500
            )
            
            if not response:
                await asyncio.sleep(1)
                continue
                
            # Process returned entries
            # Response format: [[stream_name, [[msg_id, payload_dict], ...]]]
            for stream_data in response:
                if isinstance(stream_data, (list, tuple)) and len(stream_data) >= 2:
                    messages = stream_data[1]
                    for msg in messages:
                        if isinstance(msg, (list, tuple)) and len(msg) >= 2:
                            msg_id, payload = msg[0], msg[1]
                            await process_metric_message(msg_id, payload)
                            
        except Exception as e:
            print(f"[Worker] Loop exception encountered: {e}")
            await asyncio.sleep(5)  # Back off on connection failures
            
    print("[Worker] Anomaly detection stream consumer stopped.")

def start_worker():
    """Utility to spawn the worker coroutine in the background."""
    global worker_task, worker_running
    worker_running = True
    worker_task = asyncio.create_task(run_anomaly_worker())

def stop_worker():
    """Utility to trigger cancellation and shutdown of the worker."""
    global worker_running
    worker_running = False
