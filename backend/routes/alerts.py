from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from core.database import get_db_cursor
from core.security import get_current_user_id
from models.alert import AlertResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])

@router.get("/", response_model=List[AlertResponse])
def list_alerts(
    resolved: Optional[bool] = False,
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Retrieve alerts for services owned by the authenticated user.
    By default, lists unresolved alerts.
    """
    query = (
        "SELECT a.id, a.service_id, a.metric_id, a.severity, a.message, a.is_resolved, a.created_at, a.resolved_at "
        "FROM alerts a "
        "JOIN services s ON a.service_id = s.id "
        "WHERE s.owner_id = %s "
    )
    params = [current_user_id]
    
    if resolved is not None:
        query += "AND a.is_resolved = %s "
        params.append(resolved)
        
    query += "ORDER BY a.created_at DESC"
    
    with get_db_cursor() as cur:
        cur.execute(query, tuple(params))
        alerts = cur.fetchall()
        
    return alerts

@router.patch("/{alert_id}/resolve", response_model=AlertResponse)
def resolve_alert(
    alert_id: UUID,
    current_user_id: str = Depends(get_current_user_id)
):
    """Mark an alert as resolved. Validates that the user owns the corresponding service."""
    alert_id_str = str(alert_id)
    
    with get_db_cursor() as cur:
        cur.execute(
            "UPDATE alerts a "
            "SET is_resolved = TRUE, resolved_at = NOW() "
            "FROM services s "
            "WHERE a.service_id = s.id AND a.id = %s AND s.owner_id = %s "
            "RETURNING a.id, a.service_id, a.metric_id, a.severity, a.message, a.is_resolved, a.created_at, a.resolved_at",
            (alert_id_str, current_user_id)
        )
        resolved_alert = cur.fetchone()
        
    if not resolved_alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found or you do not have permission to modify it"
        )
        
    return resolved_alert
