"""Candidate evaluation + match evidence workflow (Phase 3.6).

Orchestrates a single deterministic run for a JobApplication: load the
application and validate organization scope, resolve an approved/current
JobProfile for the application's Job and a current CandidateProfile for the
application's Resume, enforce context consistency, then generate and validate
match evidence and an evaluation explanation through the AI provider, persist a
new versioned CandidateEvaluation (with its MatchEvidence), and record
workflow/step/AI traces.

This workflow produces evidence and explanation for HR review only. It never
creates an HRDecision, never recommends hire/reject/advance, and never lets the
LLM produce a score (no approved scoring formula exists; the score is left
nullable). Only the provider-agnostic ``AIProvider`` interface is consumed; real
provider adapters, LangChain/LangGraph/agents, scoring, and workers are out of
scope. The workflow never commits; the caller owns the transaction.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.ai.contracts import (
    AI_CONTRACT_SCHEMA_VERSION,
    EvaluationExplanationOutput,
    MatchEvidenceOutput,
    validate_evaluation_explanation,
    validate_match_evidence,
)
from app.ai.providers.base import AIProvider, StructuredGenerationRequest
from app.ai.providers.errors import ProviderError
from app.models import CandidateProfile, JobApplication, JobProfile
from app.services.candidate_profile_service import CandidateProfileService
from app.services.errors import NotFoundError, ValidationError
from app.services.evaluation_service import EvaluationService
from app.services.job_profile_service import JobProfileService
from app.services.workflow_trace_service import WorkflowTraceService

WORKFLOW_TYPE = "candidate_evaluation"
STEP_NAME = "evaluate_candidate"
EVIDENCE_AI_COMPONENT = "match_evidence_generator"
EXPLANATION_AI_COMPONENT = "evaluation_explainer"
PROMPT_VERSION = "1"


def _sha256(value: str) -> str:
    """Return the hex SHA-256 digest of a string value."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _serialize(value: object) -> str:
    """Serialize a value deterministically for hashing or provider input."""
    return json.dumps(value, sort_keys=True, default=str)


def _profile_hash(profile_data: dict) -> str:
    """Return a deterministic hash of a structured profile payload."""
    return _sha256(_serialize(profile_data))


@dataclass(frozen=True)
class CandidateEvaluationResult:
    """Outcome of a successful candidate evaluation run."""

    evaluation_id: uuid.UUID
    match_evidence_id: uuid.UUID
    workflow_run_id: uuid.UUID
    workflow_step_trace_id: uuid.UUID
    evidence_ai_trace_id: uuid.UUID
    explanation_ai_trace_id: uuid.UUID
    version_number: int


class CandidateEvaluationWorkflow:
    """Orchestrate a single candidate evaluation run."""

    def __init__(
        self,
        *,
        evidence_provider: AIProvider,
        explanation_provider: AIProvider,
        trace_service: WorkflowTraceService | None = None,
        evaluation_service: EvaluationService | None = None,
        job_profile_service: JobProfileService | None = None,
        candidate_profile_service: CandidateProfileService | None = None,
    ) -> None:
        self._evidence_provider = evidence_provider
        self._explanation_provider = explanation_provider
        self._trace_service = trace_service or WorkflowTraceService()
        self._evaluation_service = evaluation_service or EvaluationService()
        self._job_profile_service = job_profile_service or JobProfileService()
        self._candidate_profile_service = candidate_profile_service or CandidateProfileService()

    def run(
        self,
        db: Session,
        *,
        job_application_id: uuid.UUID,
        organization_id: uuid.UUID | None = None,
    ) -> CandidateEvaluationResult:
        """Execute the evaluation run, raising on any failure."""
        application = self._get_application(
            db, job_application_id=job_application_id, organization_id=organization_id
        )
        resolved_org_id = organization_id or application.organization_id
        job_profile = self._get_approved_job_profile(
            db, application, organization_id=resolved_org_id
        )
        candidate_profile = self._get_current_candidate_profile(
            db, application, organization_id=resolved_org_id
        )
        self._enforce_context_consistency(application, job_profile, candidate_profile)

        run = self._trace_service.start_run(
            db,
            organization_id=resolved_org_id,
            workflow_type=WORKFLOW_TYPE,
            related_entity_type="job_application",
            related_entity_id=application.id,
            status="running",
        )
        step = self._trace_service.start_step(
            db,
            workflow_run_id=run.id,
            step_name=STEP_NAME,
            status="running",
        )
        input_reference = self._input_reference(application, job_profile, candidate_profile)

        evidence, _evidence_result, evidence_trace = self._run_ai_component(
            db,
            step=step,
            run=run,
            provider=self._evidence_provider,
            component_name=EVIDENCE_AI_COMPONENT,
            input_text=self._evidence_input(application, job_profile, candidate_profile),
            output_schema=MatchEvidenceOutput,
            validate_fn=validate_match_evidence,
            input_reference=input_reference,
        )
        explanation, explanation_result, explanation_trace = self._run_ai_component(
            db,
            step=step,
            run=run,
            provider=self._explanation_provider,
            component_name=EXPLANATION_AI_COMPONENT,
            input_text=self._explanation_input(evidence, job_profile, candidate_profile),
            output_schema=EvaluationExplanationOutput,
            validate_fn=validate_evaluation_explanation,
            input_reference=input_reference,
        )

        evaluation = self._evaluation_service.create_version(
            db,
            job_application_id=application.id,
            job_profile_id=job_profile.id,
            candidate_profile_id=candidate_profile.id,
            status="completed",
            explanation=explanation.model_dump(),
            provenance={
                "workflow": WORKFLOW_TYPE,
                "provider": explanation_result.provider,
                "model": explanation_result.model,
                "schema_version": explanation_result.schema_version or AI_CONTRACT_SCHEMA_VERSION,
            },
            organization_id=resolved_org_id,
            make_current=True,
        )
        match_evidence = self._evaluation_service.add_match_evidence(
            db,
            candidate_evaluation_id=evaluation.id,
            evidence_type=evidence.evidence_type,
            requirement_ref=evidence.requirement_ref,
            candidate_evidence=evidence.candidate_evidence,
            strength=evidence.strength,
            provenance=evidence.provenance,
            organization_id=resolved_org_id,
        )

        self._trace_service.mark_step_completed(db, workflow_step_trace_id=step.id)
        self._trace_service.mark_run_completed(db, workflow_run_id=run.id)

        return CandidateEvaluationResult(
            evaluation_id=evaluation.id,
            match_evidence_id=match_evidence.id,
            workflow_run_id=run.id,
            workflow_step_trace_id=step.id,
            evidence_ai_trace_id=evidence_trace.id,
            explanation_ai_trace_id=explanation_trace.id,
            version_number=evaluation.version_number,
        )

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
            raise ValidationError("JobApplication belongs to a different organization.")
        return application

    def _get_approved_job_profile(
        self,
        db: Session,
        application: JobApplication,
        *,
        organization_id: uuid.UUID,
    ) -> JobProfile:
        job_profile = self._job_profile_service.get_current_or_latest(
            db, job_id=application.job_id, organization_id=organization_id
        )
        if job_profile is None or job_profile.status != "approved":
            raise ValidationError("An approved current JobProfile is required for evaluation.")
        return job_profile

    def _get_current_candidate_profile(
        self,
        db: Session,
        application: JobApplication,
        *,
        organization_id: uuid.UUID,
    ) -> CandidateProfile:
        versions = self._candidate_profile_service.list_versions(
            db, resume_id=application.resume_id, organization_id=organization_id
        )
        current = [profile for profile in versions if profile.is_current]
        if not current:
            raise ValidationError("A current CandidateProfile is required for evaluation.")
        return current[-1]

    @staticmethod
    def _enforce_context_consistency(
        application: JobApplication,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
    ) -> None:
        if job_profile.job_id != application.job_id:
            raise ValidationError("JobProfile must belong to the JobApplication job.")
        if candidate_profile.resume_id != application.resume_id:
            raise ValidationError("CandidateProfile must belong to the JobApplication resume.")
        if application.resume.candidate_id != application.candidate_id:
            raise ValidationError("Resume must belong to the JobApplication candidate.")

    @staticmethod
    def _input_reference(
        application: JobApplication,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
    ) -> dict[str, str]:
        return {
            "entity": "job_application",
            "entity_id": str(application.id),
            "job_id": str(application.job_id),
            "resume_id": str(application.resume_id),
            "job_profile_id": str(job_profile.id),
            "candidate_profile_id": str(candidate_profile.id),
            "job_profile_sha256": _profile_hash(job_profile.profile_data),
            "candidate_profile_sha256": _profile_hash(candidate_profile.profile_data),
        }

    @staticmethod
    def _evidence_input(
        application: JobApplication,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
    ) -> str:
        return _serialize(
            {
                "job_title": job_profile.profile_data.get("title"),
                "requirements": job_profile.profile_data.get("requirements", []),
                "candidate_skills": candidate_profile.profile_data.get("skills", []),
            }
        )

    @staticmethod
    def _explanation_input(
        evidence: MatchEvidenceOutput,
        job_profile: JobProfile,
        candidate_profile: CandidateProfile,
    ) -> str:
        return _serialize(
            {
                "evidence": evidence.model_dump(),
                "requirements": job_profile.profile_data.get("requirements", []),
                "candidate_skills": candidate_profile.profile_data.get("skills", []),
            }
        )

    def _run_ai_component(
        self,
        db: Session,
        *,
        step,
        run,
        provider: AIProvider,
        component_name: str,
        input_text: str,
        output_schema: type,
        validate_fn,
        input_reference: dict[str, str],
    ):
        try:
            result = provider.generate_structured(
                StructuredGenerationRequest(
                    input=input_text,
                    output_schema=output_schema,
                    schema_version=AI_CONTRACT_SCHEMA_VERSION,
                    metadata={"workflow": WORKFLOW_TYPE, "component": component_name},
                )
            )
        except ProviderError as error:
            self._trace_service.record_ai_trace(
                db,
                workflow_step_trace_id=step.id,
                ai_component_name=component_name,
                status="failed",
                prompt_version=PROMPT_VERSION,
                input_schema_version=AI_CONTRACT_SCHEMA_VERSION,
                output_schema_version=AI_CONTRACT_SCHEMA_VERSION,
                input_reference=input_reference,
            )
            self._trace_service.mark_step_failed(
                db,
                workflow_step_trace_id=step.id,
                error_type=type(error).__name__,
                error_message=str(error),
            )
            self._trace_service.mark_run_failed(db, workflow_run_id=run.id)
            raise

        try:
            validated = validate_fn(result.data)
        except ValidationError as error:
            self._trace_service.record_ai_trace(
                db,
                workflow_step_trace_id=step.id,
                ai_component_name=component_name,
                status="validation_failed",
                provider=result.provider,
                model_name=result.model,
                prompt_version=PROMPT_VERSION,
                input_schema_version=AI_CONTRACT_SCHEMA_VERSION,
                output_schema_version=result.schema_version,
                latency_ms=result.latency_ms,
                input_reference=input_reference,
                validation_error={"schema": result.schema_version, "message": str(error)},
            )
            self._trace_service.mark_step_failed(
                db,
                workflow_step_trace_id=step.id,
                error_type="ValidationError",
                error_message=str(error),
            )
            self._trace_service.mark_run_failed(db, workflow_run_id=run.id)
            raise

        output_reference = {"output_sha256": _sha256(_serialize(validated.model_dump()))}
        ai_trace = self._trace_service.record_ai_trace(
            db,
            workflow_step_trace_id=step.id,
            ai_component_name=component_name,
            status="succeeded",
            provider=result.provider,
            model_name=result.model,
            prompt_version=PROMPT_VERSION,
            input_schema_version=AI_CONTRACT_SCHEMA_VERSION,
            output_schema_version=result.schema_version,
            latency_ms=result.latency_ms,
            input_reference=input_reference,
            output_reference=output_reference,
            token_usage=result.token_usage,
        )
        return validated, result, ai_trace
