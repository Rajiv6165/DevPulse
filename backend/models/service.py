from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ServiceCreate(BaseModel):
    name: str
    description: str | None = None

class ServiceResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    api_key: str
    owner_id: UUID
    created_at: datetime
    is_active: bool

    class Config:
        from_attributes = True
