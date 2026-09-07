import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.v1.deps import RequestContext, get_request_context
from app.api.v1.schemas.workflows import (
    CandidateEvaluationRunResponse,
    CandidateProfileExtractionRequest,
    CandidateProfileExtractionResponse,
    JobProfileExtractionResponse,
    JobScreeningResponse,
    ScreenedCandidateResponse,
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

    from app.ai.providers import get_provider
    from app.ai.workflows import JobProfileExtractionWorkflow
    from app.core.config import settings

    provider = get_provider(settings, provider="fake", model="fake-model")
    workflow = JobProfileExtractionWorkflow(provider)
    result = workflow.run(db, job_id=uuid.UUID(job_id), organization_id=ctx.organization_id)
    db.commit()
    return result


@router.post(
    "/jobs/{job_id}/screen",
    response_model=JobScreeningResponse,
    status_code=201,
)
def screen_candidates(
    job_id: str,
    files: list[UploadFile] = File(...),
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    """Screen a batch of uploaded CVs against a job.

    For each uploaded file this creates a candidate, stores and parses the
    resume, extracts a candidate profile, attaches the candidate to the job as
    an application, and runs the candidate evaluation workflow. The job profile
    is extracted and approved once on first use so the evaluation has an
    approved baseline to score against.
    """
    from app.ai.providers import get_provider
    from app.ai.workflows import (
        CandidateEvaluationWorkflow,
        CandidateProfileExtractionWorkflow,
        JobProfileExtractionWorkflow,
    )
    from app.core.config import settings
    from app.models import CandidateEvaluation
    from app.services.candidate_service import CandidateService
    from app.services.errors import ValidationError
    from app.services.job_application_service import JobApplicationService
    from app.services.job_profile_service import JobProfileService
    from app.services.job_service import JobService
    from app.services.resume_service import ResumeService
    from app.services.storage_service import LocalFileSystemStorage

    job_uuid = uuid.UUID(job_id)
    job = JobService().get(db, job_id=job_uuid, organization_id=ctx.organization_id)

    job_profile_service = JobProfileService()
    approved_profile = None
    for profile in job_profile_service.list_versions(
        db, job_id=job_uuid, organization_id=ctx.organization_id
    ):
        if profile.status == "approved":
            approved_profile = profile

    if approved_profile is None:
        extractor = get_provider(
            settings,
            provider="fake",
            model="fake-model",
            structured_payload={
                "title": job.title,
                "summary": "Job profile extracted during screening.",
                "requirements": [
                    {
                        "text": "Relevant professional experience",
                        "category": "must_have",
                        "dimension": "experience",
                    },
                    {
                        "text": "Core technical and domain skills",
                        "category": "must_have",
                        "dimension": "skill",
                    },
                ],
            },
        )
        extraction = JobProfileExtractionWorkflow(extractor).run(
            db, job_id=job_uuid, organization_id=ctx.organization_id
        )
        profile_claim = job_profile_service.get_version(
            db,
            profile_id=extraction.profile_id,
            organization_id=ctx.organization_id,
        )
        approved_profile = job_profile_service.approve(
            db,
            profile_id=profile_claim.id,
            approved_by_user_id=ctx.user_id,
            organization_id=ctx.organization_id,
        )

    candidate_service = CandidateService()
    resume_service = ResumeService()
    application_service = JobApplicationService()
    storage = LocalFileSystemStorage(settings.storage_root_dir)
    screened: list[ScreenedCandidateResponse] = []

    for file in files:
        if not (file.filename or "").strip():
            raise ValidationError("Every uploaded CV needs a filename.")
        file_bytes = file.file.read()
        if not file_bytes:
            raise ValidationError(f"Uploaded file {file.filename!r} is empty.")

        candidate = candidate_service.create(
            db,
            organization_id=ctx.organization_id,
            full_name=_candidate_name_from_filename(file.filename),
        )
        resume = resume_service.create_from_upload(
            db,
            candidate_id=candidate.id,
            organization_id=ctx.organization_id,
            filename=file.filename,
            content_type=file.content_type or "",
            file_bytes=file_bytes,
            max_upload_bytes=settings.max_upload_bytes,
            storage=storage,
        )
        profile_extractor = get_provider(
            settings,
            provider="fake",
            model="fake-model",
            structured_payload={
                "full_name": candidate.full_name,
                "summary": "Candidate screened for this job during this run.",
                "skills": [],
                "experience": [],
            },
        )
        CandidateProfileExtractionWorkflow(profile_extractor).run(
            db,
            resume_id=resume.id,
            organization_id=ctx.organization_id,
            resume_text=resume.extracted_text,
        )
        application = application_service.create(
            db,
            organization_id=ctx.organization_id,
            job_id=job_uuid,
            candidate_id=candidate.id,
            resume_id=resume.id,
        )
        result = CandidateEvaluationWorkflow(
            evidence_provider=get_provider(
                settings,
                provider="fake",
                model="fake-evidence-model",
                structured_payload={
                    "evidence_items": [],
                    "schema_version": "1.2",
                },
            ),
            explanation_provider=get_provider(
                settings,
                provider="fake",
                model="fake-explanation-model",
                structured_payload={
                    "summary": f"Candidate screened against {job.title}.",
                    "points": [],
                    "schema_version": "1.1",
                },
            ),
        ).run(
            db,
            job_application_id=application.id,
            organization_id=ctx.organization_id,
        )
        evaluation = db.get(CandidateEvaluation, result.evaluation_id)
        screened.append(
            ScreenedCandidateResponse(
                candidate_id=candidate.id,
                resume_id=resume.id,
                application_id=application.id,
                evaluation_id=result.evaluation_id,
                score=str(evaluation.score) if evaluation is not None else None,
            )
        )

    db.commit()
    return {
        "job_id": job_uuid,
        "job_title": job.title,
        "screened": screened,
    }


def _candidate_name_from_filename(filename: str) -> str:
    """Derive a display name from a CV filename like ``ada-lovelace-cv.pdf``."""
    stem = filename.rsplit(".", 1)[0].replace("_", " ").replace("-", " ").strip()
    words = [word for word in stem.split() if word]
    if not words:
        return "Screened Candidate"
    cleaned = [
        word[:1].upper() + word[1:] if word else word
        for word in words
        if any(char.isalnum() for char in word)
    ]
    if not cleaned:
        return "Screened Candidate"
    return " ".join(cleaned)


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

    from app.ai.providers import get_provider
    from app.ai.workflows import CandidateProfileExtractionWorkflow
    from app.core.config import settings
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

    provider = get_provider(
        settings,
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

    from app.ai.providers import get_provider
    from app.ai.workflows import CandidateEvaluationWorkflow
    from app.core.config import settings

    evidence_provider = get_provider(
        settings,
        provider="fake",
        model="fake-evidence-model",
        structured_payload={
            "evidence_items": [],
            "schema_version": "1.2",
        },
    )
    explanation_provider = get_provider(
        settings,
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
