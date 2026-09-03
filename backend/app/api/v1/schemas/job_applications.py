from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class JobApplicationCreate(BaseModel):
    job_id: UUID
    candidate_id: UUID
    resume_id: UUID


class JobApplicationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    job_id: UUID
    candidate_id: UUID
    resume_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime
