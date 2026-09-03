import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.deps import RequestContext, get_request_context
from app.api.v1.schemas.job_applications import JobApplicationCreate, JobApplicationResponse
from app.core.database import get_db
from app.services.job_application_service import JobApplicationService

router = APIRouter()


@router.post(
    "/job-applications",
    response_model=JobApplicationResponse,
    status_code=201,
)
def create_job_application(
    body: JobApplicationCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    return JobApplicationService().create(
        db,
        organization_id=ctx.organization_id,
        job_id=uuid.UUID(body.job_id) if isinstance(body.job_id, str) else body.job_id,
        candidate_id=(
            uuid.UUID(body.candidate_id)
            if isinstance(body.candidate_id, str)
            else body.candidate_id
        ),
        resume_id=(
            uuid.UUID(body.resume_id) if isinstance(body.resume_id, str) else body.resume_id
        ),
    )


@router.get(
    "/job-applications/{application_id}",
    response_model=JobApplicationResponse,
)
def get_job_application(
    application_id: str,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    return JobApplicationService().get(
        db,
        application_id=uuid.UUID(application_id),
        organization_id=ctx.organization_id,
    )


@router.get(
    "/jobs/{job_id}/applications",
    response_model=list[JobApplicationResponse],
)
def list_job_applications(
    job_id: str,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    return JobApplicationService().list_by_job(
        db,
        job_id=uuid.UUID(job_id),
        organization_id=ctx.organization_id,
    )
