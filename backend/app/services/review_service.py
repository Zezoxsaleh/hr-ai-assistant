from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Candidate,
    CandidateEvaluation,
    HRDecision,
    Job,
    JobApplication,
    MatchEvidence,
)
from app.services.candidate_pool_service import (
    VALID_APPLICATION_STATUSES,
    assign_group,
)
from app.services.errors import ValidationError
from app.services.evaluation_service import EvaluationService
from app.services.job_application_service import JobApplicationService

TALENT_POOL_STATUSES = frozenset({"hold", "advanced"})


@dataclass(frozen=True)
class ApplicationSummaryRow:
    """One org-wide application row (application + candidate + job + score)."""

    application: JobApplication
    candidate: Candidate
    job: Job
    current_evaluation: CandidateEvaluation | None


@dataclass(frozen=True)
class TalentPoolRow:
    """One hold/advanced candidate with application context."""

    application: JobApplication
    candidate: Candidate
    job: Job
    current_evaluation: CandidateEvaluation | None
    latest_decision: HRDecision | None
    group: str


@dataclass(frozen=True)
class ReviewBundle:
    """Everything the review screen needs for one application."""

    application: JobApplication
    candidate: Candidate
    job: Job
    evaluations: list[CandidateEvaluation]
    current_evaluation: CandidateEvaluation | None
    evidence: list[MatchEvidence]
    latest_decision: HRDecision | None
    group: str


class ReviewService:
    """Read-only aggregation service backing the review and pipeline screens.

    Composes existing persisted data (applications, candidates, jobs, current
    evaluations, evidence, HR decisions) into the read models the API contract
    exposes. Never recomputes scores and never touches the AI or scoring
    services.
    """

    @staticmethod
    def _as_decimal(score: object) -> Decimal | None:
        """Normalize an evaluation score to Decimal (DB rows may expose str)."""
        if score is None:
            return None
        if isinstance(score, Decimal):
            return score
        return Decimal(str(score))

    @staticmethod
    def _latest_decision_id_subquery():
        return (
            select(HRDecision.id)
            .where(HRDecision.job_application_id == JobApplication.id)
            .order_by(HRDecision.created_at.desc())
            .limit(1)
            .correlate(JobApplication)
            .scalar_subquery()
        )

    def list_application_summaries(
        self,
        db: Session,
        *,
        organization_id: uuid.UUID,
        status: str | None = None,
    ) -> list[ApplicationSummaryRow]:
        """Return org-wide application summaries, newest first.

        Organization scope is enforced directly; only each application's
        current evaluation is considered (``is_current=True``), avoiding any
        load of version history and any N+1.
        """
        if status is not None and status not in VALID_APPLICATION_STATUSES:
            raise ValidationError(f"Invalid application status filter: {status!r}.")

        query = (
            select(JobApplication, Candidate, Job, CandidateEvaluation)
            .join(Candidate, Candidate.id == JobApplication.candidate_id)
            .join(Job, Job.id == JobApplication.job_id)
            .outerjoin(
                CandidateEvaluation,
                (CandidateEvaluation.job_application_id == JobApplication.id)
                & CandidateEvaluation.is_current.is_(True),
            )
            .where(JobApplication.organization_id == organization_id)
            .order_by(JobApplication.created_at.desc())
        )
        if status is not None:
            query = query.where(JobApplication.status == status)

        rows = db.execute(query).all()
        return [
            ApplicationSummaryRow(
                application=application,
                candidate=candidate,
                job=job,
                current_evaluation=evaluation,
            )
            for application, candidate, job, evaluation in rows
        ]

    def list_talent_pool(
        self,
        db: Session,
        *,
        organization_id: uuid.UUID,
    ) -> list[TalentPoolRow]:
        """Return org-wide hold/advanced candidates ranked by current score.

        Rows carry application context, the persisted current evaluation score,
        the deterministic grouping band, and the latest HR decision. Decisions
        are left-joined so candidates without a decision are never hidden.
        """
        latest_decision_id = self._latest_decision_id_subquery()

        query = (
            select(JobApplication, Candidate, Job, CandidateEvaluation, HRDecision)
            .join(Candidate, Candidate.id == JobApplication.candidate_id)
            .join(Job, Job.id == JobApplication.job_id)
            .outerjoin(
                CandidateEvaluation,
                (CandidateEvaluation.job_application_id == JobApplication.id)
                & CandidateEvaluation.is_current.is_(True),
            )
            .outerjoin(HRDecision, HRDecision.id == latest_decision_id)
            .where(JobApplication.organization_id == organization_id)
            .where(JobApplication.status.in_(TALENT_POOL_STATUSES))
        )

        rows = db.execute(query).all()

        entries = [
            TalentPoolRow(
                application=application,
                candidate=candidate,
                job=job,
                current_evaluation=evaluation,
                latest_decision=decision,
                group=assign_group(self._as_decimal(evaluation.score if evaluation else None)),
            )
            for application, candidate, job, evaluation, decision in rows
        ]

        entries.sort(
            key=lambda entry: (
                entry.current_evaluation is None
                or self._as_decimal(entry.current_evaluation.score) is None,
                -(self._as_decimal(entry.current_evaluation.score) or Decimal(0))
                if entry.current_evaluation
                else 0,
            )
        )
        return entries

    def get_review_bundle(
        self,
        db: Session,
        *,
        application_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> ReviewBundle:
        """Return the complete read-only review bundle for one application."""
        application = JobApplicationService().get(
            db, application_id=application_id, organization_id=organization_id
        )
        candidate = db.get(Candidate, application.candidate_id)
        job = db.get(Job, application.job_id)

        evaluations = EvaluationService().list_versions(
            db,
            job_application_id=application.id,
            organization_id=organization_id,
        )
        current = next((v for v in evaluations if v.is_current), None)

        evidence: list[MatchEvidence] = []
        if current is not None:
            evidence = list(
                db.scalars(
                    select(MatchEvidence)
                    .where(MatchEvidence.candidate_evaluation_id == current.id)
                    .order_by(MatchEvidence.created_at)
                )
            )

        latest_decision = db.scalar(
            select(HRDecision)
            .where(HRDecision.job_application_id == application.id)
            .order_by(HRDecision.created_at.desc())
            .limit(1)
        )

        score = self._as_decimal(current.score if current is not None else None)
        return ReviewBundle(
            application=application,
            candidate=candidate,
            job=job,
            evaluations=evaluations,
            current_evaluation=current,
            evidence=evidence,
            latest_decision=latest_decision,
            group=assign_group(score),
        )
