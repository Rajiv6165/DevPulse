import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from core.database import get_db_cursor

class IncidentCorrelator:
    """Correlates anomalies across metrics and services to identify root causes and group incidents."""

    def _get_service_names(self, service_ids: List[str]) -> Dict[str, str]:
        """Resolves service IDs to service names for formatting summaries."""
        if not service_ids:
            return {}
        try:
            with get_db_cursor() as cur:
                placeholders = ",".join(["%s"] * len(service_ids))
                cur.execute(
                    f"SELECT id, name FROM services WHERE id IN ({placeholders})",
                    tuple(service_ids)
                )
                rows = cur.fetchall()
                return {str(row["id"]): row["name"] for row in rows}
        except Exception as e:
            print(f"[Correlator] Error fetching service names: {e}")
            return {sid: f"Service-{sid[:8]}" for sid in service_ids}

    def correlate_anomaly(
        self, 
        service_id: str, 
        metric_type: str, 
        detected_at: datetime
    ) -> Optional[Dict[str, Any]]:
        """
        Invoked when an anomaly is detected.
        Checks for concurrent anomalies within a 2-minute window.
        Groups them into an incident and identifies the root cause chronologically.
        """
        service_id_str = str(service_id)
        
        try:
            # 1. Fetch other anomalies in the 2-minute window (excluding current service)
            start_window = detected_at - timedelta(minutes=2)
            end_window = detected_at + timedelta(minutes=2)
            
            with get_db_cursor() as cur:
                cur.execute(
                    "SELECT service_id, metric_type, detected_at "
                    "FROM anomalies "
                    "WHERE detected_at >= %s AND detected_at <= %s AND service_id != %s",
                    (start_window, end_window, service_id_str)
                )
                other_anomalies = cur.fetchall()
                
            if not other_anomalies:
                # No other concurrent anomalies, no grouped incident to create
                return None
                
            # Gather service IDs of all involved anomalous services
            involved_service_ids = {service_id_str} | {str(a["service_id"]) for a in other_anomalies}
            
            # 2. Check for active (unresolved) incidents
            with get_db_cursor() as cur:
                cur.execute(
                    "SELECT id, root_cause_service_id, affected_service_ids, started_at, summary "
                    "FROM incidents "
                    "WHERE resolved_at IS NULL"
                )
                active_incidents = cur.fetchall()
                
            target_incident = None
            for inc in active_incidents:
                inc_services = {str(inc["root_cause_service_id"])} | {str(sid) for sid in inc["affected_service_ids"]}
                # If there's overlap between active incident services and involved services
                if inc_services & involved_service_ids:
                    target_incident = inc
                    break
                    
            if target_incident:
                # Update existing active incident
                incident_id = target_incident["id"]
                all_services = inc_services | involved_service_ids
                
                # Fetch all anomalies for these services in the 2-minute window around incident start
                with get_db_cursor() as cur:
                    placeholders = ",".join(["%s"] * len(all_services))
                    cur.execute(
                        f"SELECT service_id, detected_at FROM anomalies "
                        f"WHERE service_id IN ({placeholders}) "
                        f"ORDER BY detected_at ASC",
                        tuple(all_services)
                    )
                    anomalies_timeline = cur.fetchall()
                
                # Earliest anomaly's service is the root cause
                root_cause_service = str(anomalies_timeline[0]["service_id"])
                affected_services = list(all_services - {root_cause_service})
                
                # Resolve names
                names = self._get_service_names([root_cause_service] + affected_services)
                rc_name = names.get(root_cause_service, root_cause_service)
                aff_names = [names.get(sid, sid) for sid in affected_services]
                
                summary = (
                    f"Grouped incident: {rc_name} degraded. "
                    f"Downstream impact detected on services: {', '.join(aff_names)}."
                )
                
                with get_db_cursor() as cur:
                    cur.execute(
                        "UPDATE incidents "
                        "SET root_cause_service_id = %s, affected_service_ids = %s, summary = %s "
                        "WHERE id = %s "
                        "RETURNING id, root_cause_service_id, affected_service_ids, started_at, summary",
                        (root_cause_service, affected_services, summary, str(incident_id))
                    )
                    updated_inc = cur.fetchone()
                return updated_inc
                
            else:
                # Create a new incident
                # Query all anomalies in this window for all involved services to determine the root cause
                with get_db_cursor() as cur:
                    placeholders = ",".join(["%s"] * len(involved_service_ids))
                    cur.execute(
                        f"SELECT service_id, detected_at FROM anomalies "
                        f"WHERE service_id IN ({placeholders}) AND detected_at >= %s AND detected_at <= %s "
                        f"ORDER BY detected_at ASC",
                        tuple(involved_service_ids) + (start_window, end_window)
                    )
                    anomalies_timeline = cur.fetchall()
                    
                root_cause_service = str(anomalies_timeline[0]["service_id"])
                affected_services = list(involved_service_ids - {root_cause_service})
                started_at = anomalies_timeline[0]["detected_at"]
                
                # Resolve names
                names = self._get_service_names([root_cause_service] + affected_services)
                rc_name = names.get(root_cause_service, root_cause_service)
                aff_names = [names.get(sid, sid) for sid in affected_services]
                
                summary = (
                    f"Grouped incident: {rc_name} degraded. "
                    f"Downstream impact detected on services: {', '.join(aff_names)}."
                )
                
                new_id = str(uuid.uuid4())
                with get_db_cursor() as cur:
                    cur.execute(
                        "INSERT INTO incidents (id, root_cause_service_id, affected_service_ids, started_at, resolved_at, summary) "
                        "VALUES (%s, %s, %s, %s, NULL, %s) "
                        "RETURNING id, root_cause_service_id, affected_service_ids, started_at, summary",
                        (new_id, root_cause_service, affected_services, started_at, summary)
                    )
                    new_inc = cur.fetchone()
                return new_inc
                
        except Exception as e:
            print(f"[Correlator] Incident correlation error: {e}")
            return None

    def resolve_incident_if_all_alerts_resolved(self, service_id: str):
        """Checks active incidents including this service and resolves if all alert logs are now resolved."""
        service_id_str = str(service_id)
        try:
            with get_db_cursor() as cur:
                # Find active incident where the service is root cause or affected
                cur.execute(
                    "SELECT id, root_cause_service_id, affected_service_ids "
                    "FROM incidents "
                    "WHERE resolved_at IS NULL AND (root_cause_service_id = %s OR %s = ANY(affected_service_ids))",
                    (service_id_str, service_id_str)
                )
                incidents = cur.fetchall()
                
            for inc in incidents:
                incident_id = inc["id"]
                all_services = [str(inc["root_cause_service_id"])] + [str(sid) for sid in inc["affected_service_ids"]]
                
                with get_db_cursor() as cur:
                    placeholders = ",".join(["%s"] * len(all_services))
                    cur.execute(
                        f"SELECT COUNT(*)::integer FROM alerts "
                        f"WHERE service_id IN ({placeholders}) AND is_resolved = FALSE",
                        tuple(all_services)
                    )
                    unresolved_count = cur.fetchone()["count"]
                    
                if unresolved_count == 0:
                    with get_db_cursor() as cur:
                        cur.execute(
                            "UPDATE incidents SET resolved_at = NOW() WHERE id = %s",
                            (str(incident_id),)
                        )
                        print(f"[Correlator] Automatically resolved incident {incident_id} (all alerts resolved).")
                        
        except Exception as e:
            print(f"[Correlator] Incident auto-resolution error: {e}")
