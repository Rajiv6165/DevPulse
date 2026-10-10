from datetime import datetime
from enum import Enum
from typing import Any, ClassVar
from uuid import UUID

from pydantic import BaseModel, Field


class MetricType(str, Enum):
    CPU = "cpu"
    MEMORY = "memory"
    ERROR_RATE = "error_rate"
    RESPONSE_TIME = "response_time"
    CUSTOM = "custom"

class MetricIngest(BaseModel):
    service_id: UUID
    metric_type: MetricType
    value: float
    timestamp: datetime | None = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)

class MetricResponse(BaseModel):
    id: UUID
    service_id: UUID
    metric_type: MetricType
    value: float
    timestamp: datetime
    metadata: dict[str, Any]

    class Config:
        from_attributes = True
        json_encoders: ClassVar[dict] = {
            datetime: lambda v: v.isoformat()
        }
