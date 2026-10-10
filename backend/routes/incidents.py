from uuid import UUID

from core.database import get_db_cursor
from core.security import get_current_user_id
from fastapi import APIRouter, Depends, HTTPException, Query, status

router = APIRouter(prefix="/incidents", tags=["incidents"])

@router.get("/")
def list_incidents(
    active: bool | None = Query(default=None),
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Retrieve incidents for services owned by the authenticated user.
    Supports filtering by active (unresolved) status.
    """
    query = (
        "SELECT i.id, i.root_cause_service_id, i.affected_service_ids, i.started_at, i.resolved_at, i.summary, "
        "s.name as root_cause_service_name "
        "FROM incidents i "
        "JOIN services s ON i.root_cause_service_id = s.id "
        "WHERE s.owner_id = %s "
    )
    params = [current_user_id]
    
    if active is True:
        query += "AND i.resolved_at IS NULL "
    elif active is False:
        query += "AND i.resolved_at IS NOT NULL "
        
    query += "ORDER BY i.started_at DESC"
    
    try:
        with get_db_cursor() as cur:
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
            
        results = []
        for r in rows:
            results.append({
                "id": str(r["id"]),
                "root_cause_service_id": str(r["root_cause_service_id"]),
                "root_cause_service_name": r["root_cause_service_name"],
                "affected_service_ids": [str(sid) for sid in r["affected_service_ids"]],
                "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                "resolved_at": r["resolved_at"].isoformat() if r["resolved_at"] else None,
                "summary": r["summary"]
            })
        return results
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error querying incidents: {e}"
        )

@router.get("/{incident_id}")
def get_incident_timeline(
    incident_id: UUID,
    current_user_id: str = Depends(get_current_user_id)
):
    """
    Retrieves full incident timeline detailing the chronological order of 
    anomalies contributing to the grouped incident.
    """
    incident_id_str = str(incident_id)
    
    # 1. Enforce ownership validation
    try:
        with get_db_cursor() as cur:
            cur.execute(
                "SELECT i.id, i.root_cause_service_id, i.affected_service_ids, i.started_at, i.resolved_at, i.summary, "
                "s.name as root_cause_service_name "
                "FROM incidents i "
                "JOIN services s ON i.root_cause_service_id = s.id "
                "WHERE i.id = %s AND s.owner_id = %s",
                (incident_id_str, current_user_id)
            )
            incident = cur.fetchone()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error finding incident: {e}"
        )
        
    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found or access denied"
        )
        
    # 2. Gather list of all involved services (root cause + affected)
    services_list = [str(incident["root_cause_service_id"])] + [str(sid) for sid in incident["affected_service_ids"]]
    
    # 3. Retrieve anomalies for those services in the active window
    started_at = incident["started_at"]
    resolved_at = incident["resolved_at"]
    
    try:
        with get_db_cursor() as cur:
            placeholders = ",".join(["%s"] * len(services_list))
            query = (
                f"SELECT a.id, a.service_id, a.metric_type, a.score, a.detected_at, a.context, "
                f"s.name as service_name "
                f"FROM anomalies a "
                f"JOIN services s ON a.service_id = s.id "
                f"WHERE a.service_id IN ({placeholders}) "
                f"AND a.detected_at >= %s "
            )
            params = list(services_list) + [started_at]
            
            if resolved_at:
                query += "AND a.detected_at <= %s "
                params.append(resolved_at)
                
            query += "ORDER BY a.detected_at ASC"
            cur.execute(query, tuple(params))
            timeline_rows = cur.fetchall()
            
        timeline = []
        for row in timeline_rows:
            timeline.append({
                "anomaly_id": str(row["id"]),
                "service_id": str(row["service_id"]),
                "service_name": row["service_name"],
                "metric_type": row["metric_type"],
                "score": float(row["score"]),
                "detected_at": row["detected_at"].isoformat(),
                "explanation": row["context"].get("explanation", "")
            })
            
        return {
            "id": str(incident["id"]),
            "root_cause_service_id": str(incident["root_cause_service_id"]),
            "root_cause_service_name": incident["root_cause_service_name"],
            "affected_service_ids": [str(sid) for sid in incident["affected_service_ids"]],
            "started_at": incident["started_at"].isoformat() if incident["started_at"] else None,
            "resolved_at": incident["resolved_at"].isoformat() if incident["resolved_at"] else None,
            "summary": incident["summary"],
            "timeline": timeline
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error building timeline: {e}"
        )
