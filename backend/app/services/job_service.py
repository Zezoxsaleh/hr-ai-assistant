from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import Job
from app.services.errors import NotFoundError, ValidationError


class JobService:
    """Minimal job CRUD operations."""

    def create(
        self,
        db: Session,
        *,
        organization_id: uuid.UUID,
        title: str,
        raw_description: str | None = None,
        created_by_user_id: uuid.UUID | None = None,
    ) -> Job:
        """Create a new job."""
        job = Job(
            organization_id=organization_id,
            created_by_user_id=created_by_user_id,
            title=title,
            raw_description=raw_description,
        )
        db.add(job)
        db.flush()
        return job

    def get(
        self,
        db: Session,
        *,
        job_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> Job:
        """Return one job by id, enforcing organization scope."""
        job = db.get(Job, job_id)
        if job is None:
            raise NotFoundError("Job was not found.")
        if job.organization_id != organization_id:
            raise ValidationError("Job does not belong to the expected organization.")
        return job

    def update(
        self,
        db: Session,
        *,
        job_id: uuid.UUID,
        organization_id: uuid.UUID,
        title: str | None = None,
        raw_description: str | None = None,
        status: str | None = None,
    ) -> Job:
        """Update a job's mutable fields."""
        job = self.get(db, job_id=job_id, organization_id=organization_id)
        if title is not None:
            job.title = title
        if raw_description is not None:
            job.raw_description = raw_description
        if status is not None:
            job.status = status
        db.flush()
        return job
