from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    Candidate,
    CandidateEvaluation,
    InterviewQuestion,
    InterviewQuestionSet,
    JobApplication,
    MatchEvidence,
    User,
)
from app.services.candidate_profile_service import CandidateProfileService
from app.services.errors import (
    InvalidStateError,
    NotFoundError,
    ValidationError,
    VersionConflictError,
)

QUESTION_CATEGORIES: list[str] = ["Technical", "Behavioral", "Situational", "Candidate-Specific"]

QUESTION_BANKS: dict[str, list[dict[str, str]]] = {
    "Technical": [
        {
            "id": "t1",
            "text": (
                "Walk me through how you'd design a REST API for a resource "
                "with nested relationships."
            ),
        },
        {
            "id": "t2",
            "text": (
                "How do you approach indexing strategy on a table with heavy read/write traffic?"
            ),
        },
        {
            "id": "t3",
            "text": (
                "Explain the difference between optimistic and pessimistic "
                "locking, and when you'd use each."
            ),
        },
        {
            "id": "t4",
            "text": "How would you debug a memory leak in a long-running service?",
        },
        {
            "id": "t5",
            "text": (
                "What's your approach to writing unit tests for code that depends on external APIs?"
            ),
        },
    ],
    "Behavioral": [
        {
            "id": "b1",
            "text": (
                "Tell me about a time you disagreed with a technical decision. "
                "How did you handle it?"
            ),
        },
        {
            "id": "b2",
            "text": "Describe a project that failed. What did you learn from it?",
        },
        {
            "id": "b3",
            "text": ("How do you handle receiving critical feedback on your code during review?"),
        },
        {
            "id": "b4",
            "text": (
                "Tell me about a time you had to learn a new technology quickly under a deadline."
            ),
        },
    ],
    "Situational": [
        {
            "id": "s1",
            "text": (
                "You discover a production bug affecting a subset of users right "
                "before a release freeze. What do you do?"
            ),
        },
        {
            "id": "s2",
            "text": (
                "A teammate consistently misses estimates on shared tasks. "
                "How would you address it?"
            ),
        },
        {
            "id": "s3",
            "text": (
                "You're asked to add a feature you believe will hurt code quality "
                "long-term. How do you respond?"
            ),
        },
    ],
    "Candidate-Specific": [],
}

VALID_SET_STATUSES = frozenset({"generated", "approved", "superseded"})


def _prettify_requirement(value: str) -> str:
    """Turn a requirement key like ``skills.python`` into a readable topic."""
    text = value.replace("_", " ").replace("-", " ").strip()
    for prefix in ("skills.", "skill.", "requirement.", "requirements."):
        if text.lower().startswith(prefix):
            text = text[len(prefix) :].strip()
            break
    return text[:80] if text else value


class InterviewQuestionService:
    """Curated question banks plus versioned AI-generated, HR-approved question sets."""

    def create_version(
        self,
        db: Session,
        *,
        job_application_id: uuid.UUID,
        status: str,
        questions: list[dict[str, Any]],
        generated_by: str | None = None,
        provenance: dict[str, Any] | None = None,
        organization_id: uuid.UUID | None = None,
    ) -> InterviewQuestionSet:
        if status not in VALID_SET_STATUSES:
            raise ValidationError(f"Invalid interview question set status: {status!r}.")
        if not questions:
            raise ValidationError("An interview question set requires at least one question.")
        application = self._get_application(
            db, job_application_id=job_application_id, organization_id=organization_id
        )
        for question in questions:
            self._validate_question_payload(question)

        version_number = self._next_version_number(db, job_application_id=job_application_id)
        question_set = InterviewQuestionSet(
            organization_id=application.organization_id,
            job_application_id=job_application_id,
            version_number=version_number,
            status=status,
            generated_by=generated_by,
            provenance=provenance,
            is_current=False,
        )
        db.add(question_set)
        self._flush(db)
        for position, question in enumerate(questions):
            db.add(
                InterviewQuestion(
                    question_set_id=question_set.id,
                    position=position,
                    category=question["category"],
                    text=question["text"],
                    topic=question.get("topic"),
                    requirement_key=question.get("requirement_key"),
                )
            )
        db.flush()
        return question_set

    def approve(
        self,
        db: Session,
        *,
        question_set_id: uuid.UUID,
        approved_by_user_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> InterviewQuestionSet:
        question_set = self.get(
            db, question_set_id=question_set_id, organization_id=organization_id
        )
        user = db.get(User, approved_by_user_id)
        if user is None:
            raise NotFoundError("Approving user was not found.")
        if user.organization_id != organization_id:
            raise ValidationError("Approving user must belong to the same organization.")
        if question_set.status == "approved":
            raise InvalidStateError("Interview question set is already approved.")

        self._clear_current(db, job_application_id=question_set.job_application_id)
        question_set.status = "approved"
        question_set.approved_by_user_id = approved_by_user_id
        question_set.approved_at = datetime.now(UTC)
        question_set.is_current = True
        db.flush()
        return question_set

    def update_questions(
        self,
        db: Session,
        *,
        question_set_id: uuid.UUID,
        questions: list[dict[str, Any]],
        organization_id: uuid.UUID,
    ) -> InterviewQuestionSet:
        question_set = self.get(
            db, question_set_id=question_set_id, organization_id=organization_id
        )
        if question_set.status == "approved":
            raise InvalidStateError("An approved question set cannot be edited.")
        if not questions:
            raise ValidationError("An interview question set requires at least one question.")
        for question in questions:
            self._validate_question_payload(question)
        for existing in list(question_set.questions):
            db.delete(existing)
        db.flush()
        for position, question in enumerate(questions):
            db.add(
                InterviewQuestion(
                    question_set_id=question_set.id,
                    position=position,
                    category=question["category"],
                    text=question["text"],
                    topic=question.get("topic"),
                    requirement_key=question.get("requirement_key"),
                )
            )
        db.flush()
        return question_set

    def get(
        self,
        db: Session,
        *,
        question_set_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> InterviewQuestionSet:
        question_set = db.get(InterviewQuestionSet, question_set_id)
        if question_set is None:
            raise NotFoundError("InterviewQuestionSet was not found.")
        if question_set.organization_id != organization_id:
            raise ValidationError("Question set belongs to a different organization.")
        return question_set

    def list_for_application(
        self,
        db: Session,
        *,
        job_application_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> list[InterviewQuestionSet]:
        self._get_application(
            db, job_application_id=job_application_id, organization_id=organization_id
        )
        return list(
            db.scalars(
                select(InterviewQuestionSet)
                .where(InterviewQuestionSet.job_application_id == job_application_id)
                .order_by(InterviewQuestionSet.version_number)
            )
        )

    def get_current_or_latest(
        self,
        db: Session,
        *,
        job_application_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> InterviewQuestionSet | None:
        versions = self.list_for_application(
            db, job_application_id=job_application_id, organization_id=organization_id
        )
        current = [version for version in versions if version.is_current]
        if current:
            return current[-1]
        return versions[-1] if versions else None

    @staticmethod
    def to_response(question_set: InterviewQuestionSet) -> dict[str, Any]:
        return {
            "id": question_set.id,
            "organization_id": question_set.organization_id,
            "job_application_id": question_set.job_application_id,
            "version_number": question_set.version_number,
            "status": question_set.status,
            "generated_by": question_set.generated_by,
            "approved_by_user_id": question_set.approved_by_user_id,
            "approved_at": question_set.approved_at,
            "is_current": question_set.is_current,
            "provenance": question_set.provenance,
            "created_at": question_set.created_at,
            "questions": [
                {
                    "id": question.id,
                    "position": question.position,
                    "category": question.category,
                    "text": question.text,
                    "topic": question.topic,
                    "requirement_key": question.requirement_key,
                }
                for question in question_set.questions
            ],
        }

    def get_questions(
        self,
        db: Session,
        *,
        organization_id: uuid.UUID,
        candidate_id: uuid.UUID | None,
    ) -> dict[str, Any]:
        questions = {
            category: [dict(item) for item in items] for category, items in QUESTION_BANKS.items()
        }
        if candidate_id is not None:
            questions["Candidate-Specific"] = self._candidate_specific_questions(
                db,
                organization_id=organization_id,
                candidate_id=candidate_id,
            )
        return {
            "categories": QUESTION_CATEGORIES,
            "questions": questions,
            "candidate_id": candidate_id,
        }

    def collect_candidate_skills(
        self, db: Session, *, candidate: Candidate, organization_id: uuid.UUID
    ) -> list[str]:
        profile_service = CandidateProfileService()
        seen: list[str] = []
        for resume in candidate.resumes:
            profile = profile_service.get_current_or_latest(
                db,
                resume_id=resume.id,
                organization_id=organization_id,
            )
            if profile is None:
                continue
            for skill in profile.profile_data.get("skills", []) or []:
                text = str(skill).strip()
                if text and text not in seen:
                    seen.append(text)
        return seen

    def collect_candidate_gaps(self, db: Session, *, application: JobApplication) -> list[str]:
        labels = self._requirement_labels(db, candidate_id=application.candidate_id)
        statement = (
            select(MatchEvidence)
            .join(
                CandidateEvaluation,
                MatchEvidence.candidate_evaluation_id == CandidateEvaluation.id,
            )
            .join(
                JobApplication,
                CandidateEvaluation.job_application_id == JobApplication.id,
            )
            .where(
                JobApplication.candidate_id == application.candidate_id,
                MatchEvidence.evidence_type == "missing",
            )
            .order_by(CandidateEvaluation.created_at.desc())
        )
        gaps: list[str] = []
        for evidence in db.scalars(statement):
            ref = _requirement_display_topic(evidence.requirement_ref, labels)
            if ref and ref not in gaps:
                gaps.append(ref)
            if len(gaps) >= 3:
                break
        return gaps

    @staticmethod
    def _requirement_labels(db: Session, *, candidate_id: uuid.UUID) -> dict[str, str]:
        """Map requirement_key -> display label for a candidate's current evaluation.

        Mirrors the review screen's fallback source: the current evaluation's
        persisted ``score_breakdown`` (key -> {"text": ...}). Empty when the
        candidate has no current evaluation or no readable breakdown labels.
        """
        evaluation = db.scalar(
            select(CandidateEvaluation)
            .join(
                JobApplication,
                JobApplication.id == CandidateEvaluation.job_application_id,
            )
            .where(
                JobApplication.candidate_id == candidate_id,
                CandidateEvaluation.is_current.is_(True),
            )
            .order_by(CandidateEvaluation.created_at.desc())
        )
        if evaluation is None or not evaluation.score_breakdown:
            return {}
        return {
            str(key): str(entry.get("text"))
            for key, entry in evaluation.score_breakdown.items()
            if isinstance(entry, dict) and entry.get("text")
        }

    def _candidate_specific_questions(
        self,
        db: Session,
        *,
        organization_id: uuid.UUID,
        candidate_id: uuid.UUID,
    ) -> list[dict[str, str]]:
        candidate = db.get(Candidate, candidate_id)
        if candidate is None:
            raise NotFoundError("Candidate was not found.")
        if candidate.organization_id != organization_id:
            raise ValidationError("Candidate belongs to a different organization.")

        questions: list[dict[str, str]] = []
        skills = self.collect_candidate_skills(
            db, candidate=candidate, organization_id=organization_id
        )
        if skills:
            questions.append(
                {
                    "id": f"cs-match-{candidate.id}",
                    "text": (
                        f"You listed {skills[0]} on your resume — walk me through the "
                        "most complex thing you've built with it."
                    ),
                }
            )
        gaps = self._candidate_gaps(
            db,
            candidate,
            labels=self._requirement_labels(db, candidate_id=candidate.id),
        )
        if gaps:
            questions.append(
                {
                    "id": f"cs-gap-{candidate.id}",
                    "text": (
                        f"This role expects some {gaps[0]} "
                        "experience, which isn't on your resume — how would you "
                        "approach ramping up on it?"
                    ),
                }
            )
        return questions

    @staticmethod
    def _candidate_gaps(
        db: Session,
        candidate: Candidate,
        labels: dict[str, str] | None = None,
    ) -> list[str]:
        statement = (
            select(MatchEvidence)
            .join(
                CandidateEvaluation,
                MatchEvidence.candidate_evaluation_id == CandidateEvaluation.id,
            )
            .join(
                JobApplication,
                CandidateEvaluation.job_application_id == JobApplication.id,
            )
            .where(
                JobApplication.candidate_id == candidate.id,
                MatchEvidence.evidence_type == "missing",
            )
            .order_by(CandidateEvaluation.created_at.desc())
        )
        gaps: list[str] = []
        for evidence in db.scalars(statement):
            ref = _requirement_display_topic(evidence.requirement_ref, labels)
            if ref and ref not in gaps:
                gaps.append(ref)
            if len(gaps) >= 3:
                break
        return gaps

    @staticmethod
    def _get_application(
        db: Session, *, job_application_id: uuid.UUID, organization_id: uuid.UUID | None
    ) -> JobApplication:
        application = db.get(JobApplication, job_application_id)
        if application is None:
            raise NotFoundError("JobApplication was not found.")
        if organization_id is not None and application.organization_id != organization_id:
            raise ValidationError("JobApplication belongs to a different organization.")
        return application

    @staticmethod
    def _next_version_number(db: Session, *, job_application_id: uuid.UUID) -> int:
        current_max = db.scalar(
            select(func.max(InterviewQuestionSet.version_number)).where(
                InterviewQuestionSet.job_application_id == job_application_id
            )
        )
        return (current_max or 0) + 1

    @staticmethod
    def _clear_current(db: Session, *, job_application_id: uuid.UUID) -> None:
        db.execute(
            update(InterviewQuestionSet)
            .where(
                InterviewQuestionSet.job_application_id == job_application_id,
                InterviewQuestionSet.is_current.is_(True),
            )
            .values(is_current=False)
        )

    @staticmethod
    def _flush(db: Session) -> None:
        try:
            db.flush()
        except IntegrityError as error:
            raise VersionConflictError(
                "Interview question set version could not be created."
            ) from error

    @staticmethod
    def _validate_question_payload(question: dict[str, Any]) -> None:
        category = question.get("category")
        if not isinstance(category, str) or not category:
            raise ValidationError("Each question must have a non-empty category.")
        text = question.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValidationError("Each question must have non-empty text.")


def _requirement_display_topic(requirement_ref, labels: dict[str, str] | None = None) -> str:
    """Resolve a requirement_ref to a human-readable display topic.

    Precedence: the natural-language fields the AI stores (``skill``/``text``/
    ``requirement``), then the candidate's current evaluation ``score_breakdown``
    label for the key, then a prettified form of the key. A raw system key is
    never returned as a display label.
    """
    if isinstance(requirement_ref, str):
        value = requirement_ref.strip()
        return _prettify_requirement(value) if value else ""
    if not isinstance(requirement_ref, dict):
        return ""
    for key in ("skill", "text", "requirement"):
        value = requirement_ref.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    ref_key = requirement_ref.get("requirement_key")
    if isinstance(ref_key, str) and ref_key.strip():
        if labels and labels.get(ref_key.strip()):
            return labels[ref_key.strip()]
        return _prettify_requirement(ref_key.strip())
    return ""
