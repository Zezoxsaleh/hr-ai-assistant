import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.deps import RequestContext, get_request_context
from app.api.v1.schemas.candidates import CandidateCreate, CandidateResponse
from app.core.database import get_db
from app.services.candidate_service import CandidateService

router = APIRouter()


@router.post("/candidates", response_model=CandidateResponse, status_code=201)
def create_candidate(
    body: CandidateCreate,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    return CandidateService().create(
        db,
        organization_id=ctx.organization_id,
        full_name=body.full_name,
        email=body.email,
        phone=body.phone,
    )


@router.get("/candidates/{candidate_id}", response_model=CandidateResponse)
def get_candidate(
    candidate_id: str,
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
):
    return CandidateService().get(
        db, candidate_id=uuid.UUID(candidate_id), organization_id=ctx.organization_id
    )
