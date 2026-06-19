from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from core.database import get_db_cursor
from core.security import get_current_user_id
from models.alert import AnomalyResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])

class ServiceSummaryResponse(BaseModel):
    avg_cpu: float
    avg_memory: float
    error_rate: float
    anomaly_count: int
    health_score: float

@router.get("/{service_id}/anomalies", response_model=List[AnomalyResponse])
def get_service_anomalies(
    service_id: UUID,
    hours: int = Query(default=24, ge=1, le=168),
    current_user_id: str = Depends(get_current_user_id)
):
    """Retrieve historical anomalies for a service owned by the authenticated user."""
    service_id_str = str(service_id)
    
    # 1. Enforce service ownership check
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
        
    # 2. Fetch anomalies within timeframe using SQL-injection-safe intervals
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT id, service_id, metric_type, score, detected_at, context "
            "FROM anomalies "
            "WHERE service_id = %s AND detected_at >= NOW() - (%s * INTERVAL '1 hour') "
            "ORDER BY detected_at DESC",
            (service_id_str, hours)
        )
        rows = cur.fetchall()
        
    return rows

@router.get("/{service_id}/summary", response_model=ServiceSummaryResponse)
def get_service_summary(
    service_id: UUID,
    current_user_id: str = Depends(get_current_user_id)
):
    """Retrieves average CPU, memory, error rates, anomaly count, and health score over the last 24 hours."""
    service_id_str = str(service_id)
    
    # 1. Enforce service ownership check
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
        
    # 2. Execute SQL aggregator for CPU, Memory, Error Rates, and Anomaly count in the last 24 hours
    with get_db_cursor() as cur:
        cur.execute(
            "SELECT "
            "  COALESCE(AVG(CASE WHEN metric_type = 'cpu' THEN value END), 0.0) as avg_cpu, "
            "  COALESCE(AVG(CASE WHEN metric_type = 'memory' THEN value END), 0.0) as avg_memory, "
            "  COALESCE(AVG(CASE WHEN metric_type = 'error_rate' THEN value END), 0.0) as avg_error_rate, "
            "  (SELECT COUNT(*)::integer FROM anomalies WHERE service_id = %s AND detected_at >= NOW() - INTERVAL '24 hours') as anomaly_count "
            "FROM metrics "
            "WHERE service_id = %s AND timestamp >= NOW() - INTERVAL '24 hours'",
            (service_id_str, service_id_str)
        )
        summary = cur.fetchone()
        
    avg_cpu = float(summary["avg_cpu"])
    avg_memory = float(summary["avg_memory"])
    error_rate = float(summary["avg_error_rate"])
    anomaly_count = int(summary["anomaly_count"])
    
    # 3. Calculate health score (0-100)
    # Start at 100, deduct points based on anomalies and error rate
    health_score = 100.0
    
    # Deduct 10 points per anomaly in last 24h
    health_score -= (anomaly_count * 10.0)
    
    # Deduct points based on average error rate (assume error_rate is percentage, e.g. 5.0% = -10 points)
    # If error_rate is 0.0 - 1.0 (fraction), error_rate * 100.0 is percentage
    if error_rate > 0.0:
        # Deduct error_rate directly if percentage scale, or error_rate * 100
        # Let's assume error_rate is standard percentage (e.g. 5%) and deduct 2 points per 1% error rate
        health_score -= (error_rate * 2.0)
        
    health_score = max(0.0, min(100.0, health_score))
    
    return ServiceSummaryResponse(
        avg_cpu=avg_cpu,
        avg_memory=avg_memory,
        error_rate=error_rate,
        anomaly_count=anomaly_count,
        health_score=health_score
    )
