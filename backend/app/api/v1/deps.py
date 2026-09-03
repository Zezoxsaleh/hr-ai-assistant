"""API dependency injection for Phase 4.3.

Provides the ``RequestContext`` dependency that supplies caller identity
for organization-scoped endpoints.

MVP IDENTITY MECHANISM — NOT PRODUCTION AUTHENTICATION.

This module implements a header-based identity mechanism for development
and MVP use only. It is NOT a production authentication or authorization
system. No passwords, tokens, sessions, JWT, or OAuth infrastructure is
provided or implied. Production authentication is intentionally deferred.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Organization, User


@dataclass(frozen=True)
class RequestContext:
    """Validated caller identity for organization-scoped endpoints."""

    user_id: uuid.UUID
    organization_id: uuid.UUID


def _parse_uuid(value: str, header_name: str) -> uuid.UUID:
    """Parse a header value as UUID, raising 422 on failure."""
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"{header_name} must be a valid UUID.",
        ) from None


async def get_request_context(
    x_user_id: str = Header(...),
    x_organization_id: str = Header(...),
    db: Session = Depends(get_db),
) -> RequestContext:
    """Validate caller identity and return a RequestContext.

    Validates:
    - X-User-Id is a valid UUID
    - X-Organization-Id is a valid UUID
    - User exists in DB
    - User belongs to the organization
    - User status is 'active'

    Raises 422 for malformed UUIDs.
    Raises 404 for non-existent user or organization.
    Raises 403 for org mismatch or inactive user.
    """
    user_id = _parse_uuid(x_user_id, "X-User-Id")
    organization_id = _parse_uuid(x_organization_id, "X-Organization-Id")

    organization = db.get(Organization, organization_id)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found.")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.organization_id != organization_id:
        raise HTTPException(
            status_code=403,
            detail="User does not belong to the specified organization.",
        )

    if user.status != "active":
        raise HTTPException(status_code=403, detail="User is not active.")

    return RequestContext(user_id=user_id, organization_id=organization_id)
