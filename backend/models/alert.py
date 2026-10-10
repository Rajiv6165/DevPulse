from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel


class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    CRITICAL = "critical"

class AlertResponse(BaseModel):
    id: UUID
    service_id: UUID
    metric_id: UUID | None = None
    severity: AlertSeverity
    message: str
    is_resolved: bool
    created_at: datetime
    resolved_at: datetime | None = None

    class Config:
        from_attributes = True

class AnomalyResponse(BaseModel):
    id: UUID
    service_id: UUID
    metric_type: str
    score: float
    detected_at: datetime
    context: dict[str, Any]

    class Config:
        from_attributes = True
