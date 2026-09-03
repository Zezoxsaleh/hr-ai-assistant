from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import Candidate, Resume
from app.services.errors import NotFoundError, ValidationError


class ResumeService:
    """Minimal resume CRUD operations."""

    def create(
        self,
        db: Session,
        *,
        candidate_id: uuid.UUID,
        organization_id: uuid.UUID,
        file_uri: str,
        original_filename: str | None = None,
        content_type: str | None = None,
        file_size_bytes: int | None = None,
    ) -> Resume:
        """Create a new resume for a candidate."""
        candidate = db.get(Candidate, candidate_id)
        if candidate is None:
            raise NotFoundError("Candidate was not found.")
        if candidate.organization_id != organization_id:
            raise ValidationError("Candidate does not belong to the expected organization.")
        resume = Resume(
            candidate_id=candidate_id,
            file_uri=file_uri,
            original_filename=original_filename,
            content_type=content_type,
            file_size_bytes=file_size_bytes,
        )
        db.add(resume)
        db.flush()
        return resume

    def get(
        self,
        db: Session,
        *,
        resume_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> Resume:
        """Return one resume by id, enforcing organization scope via candidate."""
        resume = db.get(Resume, resume_id)
        if resume is None:
            raise NotFoundError("Resume was not found.")
        if resume.candidate.organization_id != organization_id:
            raise ValidationError("Resume does not belong to the expected organization.")
        return resume
