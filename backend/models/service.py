from pydantic import BaseModel
from datetime import datetime
from uuid import UUID
from typing import Optional

class ServiceCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ServiceResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    api_key: str
    owner_id: UUID
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True
