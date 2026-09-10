from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Organization, User
from app.services.errors import NotFoundError, ValidationError


class UserService:
    """Minimal user operations for MVP bootstrap."""

    def list_org_users(
        self,
        db: Session,
        *,
        organization_id: uuid.UUID,
    ) -> list[User]:
        """Return all users in the specified organization, ordered by full name."""
        stmt = (
            select(User)
            .where(User.organization_id == organization_id)
            .order_by(User.full_name.asc())
        )
        return list(db.scalars(stmt).all())

    def create(
        self,
        db: Session,
        *,
        organization_id: uuid.UUID,
        email: str,
        full_name: str,
    ) -> User:
        """Create a new user in the specified organization."""
        organization = db.get(Organization, organization_id)
        if organization is None:
            raise NotFoundError("Organization was not found.")
        user = User(
            organization_id=organization_id,
            email=email,
            full_name=full_name,
        )
        db.add(user)
        db.flush()
        return user

    def get(
        self,
        db: Session,
        *,
        user_id: uuid.UUID,
        organization_id: uuid.UUID,
    ) -> User:
        """Return one user by id, enforcing organization scope."""
        user = db.get(User, user_id)
        if user is None:
            raise NotFoundError("User was not found.")
        if user.organization_id != organization_id:
            raise ValidationError("User does not belong to the expected organization.")
        return user
