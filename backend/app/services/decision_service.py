"""Deterministic human-decision application service (Phase 3.7).

Enables HR to explicitly record an HRDecision after reviewing an AI-assisted
CandidateEvaluation. This is a purely deterministic, service-layer operation and
is the ONLY sanctioned way to create an HR decision: AI workflows must never
create, modify, or finalize an HRDecision, and the final decision always belongs
to the HR professional.

The service validates the referenced JobApplication, the acting HR User, and an
optional CandidateEvaluation (which must belong to the same JobApplication and,
when an organization is supplied, the same organization). It enforces the
authoritative decision vocabulary from the ``hr_decisions`` CHECK constraint and
preserves append-only history: every call inserts a new row and never mutates
prior decisions, the CandidateEvaluation, or any JobProfile/CandidateProfile.

Recording a decision also mirrors it into the application's pipeline status so
the org-wide talent pool (hold/advanced candidates) reflects real HR actions:
``advance`` → ``advanced``, ``hold`` → ``hold``, ``reject`` → ``rejected``.

This service never commits (the caller owns the transaction), never calls an AI
provider or workflow, never computes a score or recommendation, and records no
workflow/AI traces.
"""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import CandidateEvaluation, HRDecision, JobApplication, User
from app.services.errors import NotFoundError, ValidationError

VALID_DECISIONS = frozenset({"advance", "reject", "hold"})

# The pipeline status each HR decision moves the application into. These values
# are the authoritative ``job_applications.status`` vocabulary.
DECISION_TO_STATUS = {
    "advance": "advanced",
    "hold": "hold",
    "reject": "rejected",
}


def _validate_decision(decision: str) -> None:
    """Validate a decision against the authoritative DB constraint vocabulary."""
    if decision not in VALID_DECISIONS:
        raise ValidationError(f"Invalid HR decision: {decision!r}.")


class DecisionService:
    """Deterministic creation and retrieval of HR decisions."""

    def create(
        self,
        db: Session,
        *,
        job_application_id: uuid.UUID,
        user_id: uuid.UUID,
        decision: str,
        candidate_evaluation_id: uuid.UUID | None = None,
        reason: str | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> HRDecision:
        """Record a new append-only HR decision for a JobApplication."""
        _validate_decision(decision)

        application = self._get_application(
            db,
            job_application_id=job_application_id,
            organization_id=organization_id,
        )
        self._get_user(
            db,
            user_id=user_id,
            expected_organization_id=organization_id,
            application=application,
        )
        evaluation = self._get_evaluation(
            db,
            candidate_evaluation_id=candidate_evaluation_id,
            application=application,
            organization_id=organization_id,
        )

        decision_row = HRDecision(
            job_application_id=application.id,
            user_id=user_id,
            candidate_evaluation_id=evaluation.id if evaluation is not None else None,
            decision=decision,
            reason=reason,
        )
        db.add(decision_row)
        # Mirror the decision into the application's pipeline status so the
        # talent pool (hold/advanced) reflects the HR action immediately.
        application.status = DECISION_TO_STATUS[decision]
        db.flush()
        return decision_row

    def _get_application(
        self,
        db: Session,
        *,
        job_application_id: uuid.UUID,
        organization_id: uuid.UUID | None,
    ) -> JobApplication:
        application = db.get(JobApplication, job_application_id)
        if application is None:
            raise NotFoundError("JobApplication was not found.")
        if organization_id is not None and application.organization_id != organization_id:
            raise ValidationError("JobApplication does not belong to the expected organization.")
        return application

    def _get_user(
        self,
        db: Session,
        *,
        user_id: uuid.UUID,
        expected_organization_id: uuid.UUID | None,
        application: JobApplication,
    ) -> User:
        user = db.get(User, user_id)
        if user is None:
            raise NotFoundError("User was not found.")
        if user.organization_id != application.organization_id:
            raise ValidationError("User must belong to the JobApplication organization.")
        if (
            expected_organization_id is not None
            and user.organization_id != expected_organization_id
        ):
            raise ValidationError("User does not belong to the expected organization.")
        return user

    def _get_evaluation(
        self,
        db: Session,
        *,
        candidate_evaluation_id: uuid.UUID | None,
        application: JobApplication,
        organization_id: uuid.UUID | None,
    ) -> CandidateEvaluation | None:
        if candidate_evaluation_id is None:
            return None
        evaluation = db.get(CandidateEvaluation, candidate_evaluation_id)
        if evaluation is None:
            raise NotFoundError("CandidateEvaluation was not found.")
        if evaluation.job_application_id != application.id:
            raise ValidationError("CandidateEvaluation must belong to the JobApplication.")
        if organization_id is not None and application.organization_id != organization_id:
            raise ValidationError(
                "CandidateEvaluation does not belong to the expected organization."
            )
        return evaluation
