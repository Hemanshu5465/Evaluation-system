from __future__ import annotations

import uuid
from collections.abc import Iterator

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import forbidden, unauthorized
from app.models.enums import Role
from app.models.user import User

bearer = HTTPBearer(auto_error=False)


def db_session() -> Iterator[Session]:
    yield from get_db()


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(db_session),
) -> User:
    if creds is None or not creds.credentials:
        raise unauthorized("MISSING_TOKEN", "Authorization header with a bearer token is required.")
    try:
        payload = jwt.decode(
            creds.credentials,
            _secret(),
            algorithms=[_alg()],
        )
    except jwt.ExpiredSignatureError:
        raise unauthorized("TOKEN_EXPIRED", "Access token has expired.")
    except jwt.PyJWTError:
        raise unauthorized("INVALID_TOKEN", "Access token is invalid.")

    if payload.get("type") != "access":
        raise unauthorized("INVALID_TOKEN", "Wrong token type.")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise unauthorized("INVALID_TOKEN", "Malformed token subject.")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized("USER_INACTIVE", "User account is not active.")
    # Role is always taken from the DB, never the token claim.
    request.state.user_id = str(user.id)
    return user


def _secret() -> str:
    from app.core.config import settings

    return settings.JWT_SECRET_KEY


def _alg() -> str:
    from app.core.config import settings

    return settings.JWT_ALGORITHM


def require_roles(*roles: Role):
    allowed = {r.value for r in roles}

    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise forbidden("ROLE_FORBIDDEN", f"Requires one of: {', '.join(sorted(allowed))}.")
        return user

    return _dep


require_admin = require_roles(Role.ADMIN)
require_evaluator = require_roles(Role.EVALUATOR)
require_student = require_roles(Role.STUDENT)


def get_db_dep() -> Iterator[Session]:
    yield from get_db()


# convenience re-exports
__all__ = [
    "db_session",
    "get_current_user",
    "require_roles",
    "require_admin",
    "require_evaluator",
    "require_student",
    "select",
]
