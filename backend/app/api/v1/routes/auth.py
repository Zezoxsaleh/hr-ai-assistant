"""Authentication endpoints for login, session inspection, and logout (Prompt 2)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.deps import RequestContext, get_request_context
from app.api.v1.schemas.auth import LoginRequest, TokenResponse, UserProfileResponse
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.user import User

router = APIRouter()


@router.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Authenticate with email and password, returning a signed JWT access token.

    Uses a generic authentication failure message that does not disclose whether
    the account exists or its active status.
    """
    email_clean = body.email.strip().lower()
    stmt = select(User).where(func.lower(User.email) == email_clean)
    if body.organization_id is not None:
        stmt = stmt.where(User.organization_id == body.organization_id)

    users = db.scalars(stmt).all()
    if len(users) == 0 or len(users) > 1:
        from app.services.audit_service import AuditService

        AuditService().log_auth_failure(
            db, category="invalid_credentials", organization_id=body.organization_id
        )
        # Generic error message to prevent account enumeration
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = users[0]
    if not user.is_active or user.status != "active":
        from app.services.audit_service import AuditService

        AuditService().log_auth_failure(
            db, category="account_inactive", organization_id=user.organization_id
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.password_hash or not verify_password(body.password, user.password_hash):
        from app.services.audit_service import AuditService

        AuditService().log_auth_failure(
            db, category="invalid_credentials", organization_id=user.organization_id
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(
        user_id=user.id,
        organization_id=user.organization_id,
        role=user.role,
        token_version=user.token_version,
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.jwt_expire_minutes * 60,
        user=UserProfileResponse.model_validate(user),
    )


@router.get("/auth/me", response_model=UserProfileResponse)
def get_current_user_profile(
    ctx: RequestContext = Depends(get_request_context),
) -> UserProfileResponse:
    """Return the authenticated caller's profile and organization context."""
    if ctx.auth_scheme != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return UserProfileResponse.model_validate(ctx.user)


@router.post("/auth/logout")
def logout(
    ctx: RequestContext = Depends(get_request_context),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Revoke all active tokens for the authenticated user by bumping token_version."""
    if ctx.auth_scheme != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    ctx.user.token_version += 1
    db.commit()
    return {"detail": "Logged out successfully."}
