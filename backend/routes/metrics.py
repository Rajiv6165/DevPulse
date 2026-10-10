import json
from datetime import UTC, datetime
from uuid import UUID

from core.database import get_db_cursor
from core.redis import async_redis_client
from core.security import decode_access_token, get_current_user_id
from fastapi import APIRouter, Depends, Header, HTTPException, status
from models.metric import MetricIngest, MetricResponse, MetricType

router = APIRouter(prefix="/metrics", tags=["metrics"])

@router.post("/ingest", response_model=MetricResponse, status_code=status.HTTP_201_CREATED)
async def ingest_metric(
    payload: MetricIngest,
    x_api_key: str | None = Header(None),
    authorization: str | None = Header(None)
):
    """
    Ingest a new metric. Accepts either JWT Bearer Token (for UI requests)
    or X-API-Key in header (for external SDK monitoring agents).
    Pushes the metric payload to the PostgreSQL database and Upstash Redis stream.
    """
    service_id_str = str(payload.service_id)
    
    # 1. Authenticate Request
    if x_api_key:
        # SDK API Key Authentication
        with get_db_cursor() as cur:
            cur.execute(
                "SELECT id FROM services WHERE api_key = %s AND is_active = TRUE",
                (x_api_key,)
            )
            service = cur.fetchone()
        if not service or str(service["id"]) != service_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid SDK API Key for the specified service"
            )
    elif authorization:
        # JWT Bearer Token Authentication
        token = authorization.replace("Bearer ", "").strip()
        payload_data = decode_access_token(token)
        if not payload_data or "sub" not in payload_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token or authorization credentials"
            )
        user_id = payload_data["sub"]
        
        # Verify user owns the service
        with get_db_cursor() as cur:
            cur.execute(
                "SELECT id FROM services WHERE id = %s AND owner_id = %s AND is_active = TRUE",
                (service_id_str, user_id)
            )
            service = cur.fetchone()
        if not service:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You do not own this service"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials (JWT or X-API-Key header) are required"
        )

    # 2. Insert into PostgreSQL
    ts = payload.timestamp if payload.timestamp else datetime.now(UTC)
    try:
        with get_db_cursor() as cur:
            cur.execute(
                "INSERT INTO metrics (service_id, metric_type, value, timestamp, metadata) "
                "VALUES (%s, %s, %s, %s, %s::jsonb) "
                "RETURNING id, service_id, metric_type, value, timestamp, metadata",
                (service_id_str, payload.metric_type.value, payload.value, ts, json.dumps(payload.metadata))
            )
            inserted = cur.fetchone()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record metric in database: {e!s}"
        )

    # 3. Push to Upstash Redis Stream
    try:
        stream_message = {
            "service_id": str(inserted["service_id"]),
            "metric_type": str(inserted["metric_type"]),
            "value": str(inserted["value"]),
            "timestamp": inserted["timestamp"].isoformat(),
            "metric_id": str(inserted["id"])
        }
        await async_redis_client.xadd(
            "devpulse:metrics:stream",
            "*",
            stream_message
        )
    except Exception as e:
        # Note: We logged or caught the Redis failure, but do not fail the API response
        # since the metric is successfully persisted in postgres.
        # However, for production-grade logging, print or raise appropriately.
        print(f"[Warning] Failed to push to Redis stream: {e}")

    return inserted

@router.get("/{service_id}", response_model=list[MetricResponse])
def get_metrics(
    service_id: UUID,
    metric_type: MetricType | None = None,
    limit: int = 100,
    current_user_id: str = Depends(get_current_user_id)
):
    """Retrieve historical time series metrics for a service owned by the authenticated user."""
    service_id_str = str(service_id)
    
    # 1. Enforce ownership validation
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT id FROM services WHERE id = %s AND owner_id = %s AND is_active = TRUE",
            (service_id_str, current_user_id)
        )
        service = cur.fetchone()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monitored service not found or access denied"
        )
        
    # Cap limit to prevent large queries
    query_limit = min(max(limit, 1), 1000)
    
    # 2. Query historical metrics
    query = (
        "SELECT id, service_id, metric_type, value, timestamp, metadata "
        "FROM metrics WHERE service_id = %s "
    )
    params = [service_id_str]
    
    if metric_type:
        query += "AND metric_type = %s "
        params.append(metric_type.value)
        
    query += "ORDER BY timestamp DESC LIMIT %s"
    params.append(query_limit)
    
    with get_db_cursor() as cur:
        cur.execute(query, tuple(params))
        metrics = cur.fetchall()
        
    return metrics
