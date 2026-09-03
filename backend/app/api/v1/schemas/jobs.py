from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class JobCreate(BaseModel):
    title: str
    raw_description: str | None = None


class JobUpdate(BaseModel):
    title: str | None = None
    raw_description: str | None = None
    status: str | None = None


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_by_user_id: UUID | None
    title: str
    raw_description: str | None
    status: str
    created_at: datetime
    updated_at: datetime
