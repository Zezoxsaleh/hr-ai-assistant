import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.schemas.users import UserCreate, UserResponse
from app.core.database import get_db
from app.services.user_service import UserService

router = APIRouter()


@router.post(
    "/organizations/{org_id}/users",
    response_model=UserResponse,
    status_code=201,
)
def create_user(org_id: str, body: UserCreate, db: Session = Depends(get_db)):
    """Create a user in the specified organization.

    Bootstrap/development-only endpoint. Does NOT require X-User-Id or
    X-Organization-Id headers. NOT a production authentication or secure
    administrative endpoint.
    """
    try:
        organization_uuid = uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="org_id must be a valid UUID.") from None
    return UserService().create(
        db,
        organization_id=organization_uuid,
        email=body.email,
        full_name=body.full_name,
    )
