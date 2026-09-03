import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.deps import RequestContext, get_request_context
from app.api.v1.schemas.workflows import (
    CandidateEvaluationRunResponse,
    CandidateProfileExtractionRequest,
    CandidateProfileExtractionResponse,
    JobProfileExtractionResponse,
)
from app.core.database import get_db

router = APIRouter()


@router.post(
    "/jobs/{job_id}/extract-profile",
    response_model=JobProfileExtractionResponse,
    status_code=201,
)
def extract_job_profile(
    job_id: str,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):

    from app.ai.providers.fake import FakeAIProvider
    from app.ai.workflows import JobProfileExtractionWorkflow

    provider = FakeAIProvider(provider="fake", model="fake-model")
    workflow = JobProfileExtractionWorkflow(provider)
    result = workflow.run(db, job_id=uuid.UUID(job_id), organization_id=ctx.organization_id)
    db.commit()
    return result


@router.post(
    "/resumes/{resume_id}/extract-profile",
    response_model=CandidateProfileExtractionResponse,
    status_code=201,
)
def extract_candidate_profile(
    resume_id: str,
    body: CandidateProfileExtractionRequest,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):

    from app.ai.providers.fake import FakeAIProvider
    from app.ai.workflows import CandidateProfileExtractionWorkflow
    from app.services.resume_service import ResumeService

    resume_uuid = uuid.UUID(resume_id)
    if body.resume_text is None:
        resume_text = ResumeService().get_extracted_text(
            db,
            resume_id=resume_uuid,
            organization_id=ctx.organization_id,
        )
    else:
        resume_text = body.resume_text

    provider = FakeAIProvider(
        provider="fake",
        model="fake-model",
        structured_payload={
            "full_name": "Extracted Candidate",
            "summary": "Extracted from the supplied resume text.",
            "skills": [],
            "experience": [],
        },
    )
    workflow = CandidateProfileExtractionWorkflow(provider)
    result = workflow.run(
        db,
        resume_id=resume_uuid,
        organization_id=ctx.organization_id,
        resume_text=resume_text,
    )
    db.commit()
    return result


@router.post(
    "/job-applications/{application_id}/evaluate",
    response_model=CandidateEvaluationRunResponse,
    status_code=201,
)
def evaluate_candidate(
    application_id: str,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):

    from app.ai.providers.fake import FakeAIProvider
    from app.ai.workflows import CandidateEvaluationWorkflow

    evidence_provider = FakeAIProvider(
        provider="fake",
        model="fake-evidence-model",
        structured_payload={
            "evidence_items": [],
            "schema_version": "1.2",
        },
    )
    explanation_provider = FakeAIProvider(
        provider="fake",
        model="fake-explanation-model",
        structured_payload={
            "summary": "Evaluation completed.",
            "points": [],
            "schema_version": "1.1",
        },
    )
    workflow = CandidateEvaluationWorkflow(
        evidence_provider=evidence_provider,
        explanation_provider=explanation_provider,
    )
    result = workflow.run(
        db,
        job_application_id=uuid.UUID(application_id),
        organization_id=ctx.organization_id,
    )
    db.commit()
    return result
