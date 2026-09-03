import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.deps import RequestContext, get_request_context
from app.api.v1.schemas.resumes import ResumeCreate, ResumeResponse
from app.core.database import get_db
from app.services.resume_service import ResumeService

router = APIRouter()


@router.post(
    "/candidates/{candidate_id}/resumes",
    response_model=ResumeResponse,
    status_code=201,
)
def create_resume(
    candidate_id: str,
    body: ResumeCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    return ResumeService().create(
        db,
        candidate_id=uuid.UUID(candidate_id),
        organization_id=ctx.organization_id,
        file_uri=body.file_uri,
        original_filename=body.original_filename,
        content_type=body.content_type,
        file_size_bytes=body.file_size_bytes,
    )


@router.get("/resumes/{resume_id}", response_model=ResumeResponse)
def get_resume(
    resume_id: str,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    return ResumeService().get(
        db, resume_id=uuid.UUID(resume_id), organization_id=ctx.organization_id
    )
