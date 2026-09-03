from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import Candidate
from app.services.errors import NotFoundError, ValidationError


class CandidateService:
    """Minimal candidate CRUD operations."""

    def create(
        self,
        db: Session,
        *,
        organization_id: uuid.UUID,
        full_name: str,
        email: str | None = None,
        phone: str | None = None,
    ) -> Candidate:
        """Create a new candidate."""
        candidate = Candidate(
            organization_id=organization_id,
            full_name=full_name,
            email=email,
            phone=phone,
        )
        db.add(candidate)
        db.flush()
        return candidate

    def get(
        self,
        db: Session,
        *,
        candidate_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> Candidate:
        """Return one candidate by id, enforcing organization scope."""
        candidate = db.get(Candidate, candidate_id)
        if candidate is None:
            raise NotFoundError("Candidate was not found.")
        if candidate.organization_id != organization_id:
            raise ValidationError("Candidate does not belong to the expected organization.")
        return candidate
