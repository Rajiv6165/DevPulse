import asyncio
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from core.database import get_db_cursor
from core.security import decode_access_token
from core.websocket_manager import manager

router = APIRouter(tags=["websockets"])

def get_latest_metrics_for_user(user_id: str):
    """
    Fetch the latest reading for each metric type across all active services 
    owned by the user, utilizing Postgres window functions for efficiency.
    """
    with get_db_cursor() as cur:
        cur.execute(
            "WITH ranked_metrics AS ("
            "    SELECT m.id, m.service_id, m.metric_type, m.value, m.timestamp, m.metadata, "
            "           ROW_NUMBER() OVER (PARTITION BY m.service_id, m.metric_type ORDER BY m.timestamp DESC) as rn "
            "    FROM metrics m "
            "    JOIN services s ON m.service_id = s.id "
            "    WHERE s.owner_id = %s AND s.is_active = TRUE"
            ") "
            "SELECT id, service_id, metric_type, value, timestamp, metadata "
            "FROM ranked_metrics "
            "WHERE rn = 1",
            (user_id,)
        )
        metrics = cur.fetchall()
        
    formatted = []
    for m in metrics:
        formatted.append({
            "id": str(m["id"]),
            "service_id": str(m["service_id"]),
            "metric_type": m["metric_type"],
            "value": m["value"],
            "timestamp": m["timestamp"].isoformat(),
            "metadata": m["metadata"]
        })
    return formatted

async def metrics_writer_loop(websocket: WebSocket, user_id: str):
    """Periodic loop to push the latest dashboard telemetry to the client."""
    try:
        while True:
            latest_metrics = get_latest_metrics_for_user(user_id)
            await websocket.send_json({
                "event": "metrics",
                "data": latest_metrics
            })
            await asyncio.sleep(2)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[WebSocket] Error writing metrics for user {user_id}: {e}")

@router.websocket("/ws/live")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for real-time DevOps observability data.
    Authenticates using a JWT token in query param.
    """
    # 1. Authenticate WebSocket Connection
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    user_id = payload["sub"]
    
    # 2. Register Connection
    await manager.connect(user_id, websocket)
    
    # 3. Start Periodic Metrics Broadcast Task
    writer_task = asyncio.create_task(metrics_writer_loop(websocket, user_id))
    
    try:
        while True:
            # Block and wait for client messages (e.g. ping/pongs) or connection drops
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        # 4. Clean up connection
        writer_task.cancel()
        manager.disconnect(user_id, websocket)
