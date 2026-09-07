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


class ApplicationSummaryResponse(BaseModel):
    """Organization-wide application list row used by ApplicationsList.

    Composed read model (application + candidate + job + current evaluation
    score). ``score`` is returned as a string to match the existing evaluation
    response convention.
    """

    id: UUID
    candidate_id: UUID
    candidate_name: str
    job_id: UUID
    job_title: str
    score: str | None = None
    status: str
    created_at: datetime
