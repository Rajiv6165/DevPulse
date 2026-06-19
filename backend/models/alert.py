from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from enum import Enum
from typing import Dict, Any, Optional

class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    CRITICAL = "critical"

class AlertResponse(BaseModel):
    id: UUID
    service_id: UUID
    metric_id: Optional[UUID] = None
    severity: AlertSeverity
    message: str
    is_resolved: bool
    created_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class AnomalyResponse(BaseModel):
    id: UUID
    service_id: UUID
    metric_type: str
    score: float
    detected_at: datetime
    context: Dict[str, Any]

    class Config:
        from_attributes = True
