import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.v1.deps import RequestContext, get_request_context
from app.api.v1.schemas.resumes import ResumeCreate, ResumeResponse
from app.core.config import settings
from app.core.database import get_db
from app.services.resume_service import ResumeService
from app.services.storage_service import LocalFileSystemStorage

router = APIRouter()


@router.post(
    "/candidates/{candidate_id}/resumes/upload",
    response_model=ResumeResponse,
    status_code=201,
)
def upload_resume(
    candidate_id: str,
    file: UploadFile = File(...),
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    return ResumeService().create_from_upload(
        db,
        candidate_id=uuid.UUID(candidate_id),
        organization_id=ctx.organization_id,
        filename=file.filename or "",
        content_type=file.content_type or "",
        file_bytes=file.file.read(),
        max_upload_bytes=settings.max_upload_bytes,
        storage=LocalFileSystemStorage(settings.storage_root_dir),
    )


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
