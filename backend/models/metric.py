from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from enum import Enum
from typing import Dict, Any, Optional

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
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class MetricResponse(BaseModel):
    id: UUID
    service_id: UUID
    metric_type: MetricType
    value: float
    timestamp: datetime
    metadata: Dict[str, Any]

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
