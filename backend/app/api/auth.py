from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import db_session, get_current_user
from app.core.errors import bad_request, conflict, unauthorized
from app.core.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    refresh_jti_from_raw,
    verify_password,
)
from app.models.enums import AuditAction, Role
from app.models.user import RefreshToken, User
from app.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.services import audit_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _issue_tokens(db: Session, user: User, request: Request) -> TokenResponse:
    access, expires = create_access_token(user_id=user.id, role=user.role)
    raw, jti, refresh_expires = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            token_hash=hash_refresh_token(raw),
            expires_at=refresh_expires,
            user_agent=request.headers.get("user-agent", "")[:255],
            ip=request.client.host if request.client else None,
        )
    )
    db.commit()
    return TokenResponse(
        access_token=access,
        refresh_token=raw,
        expires_at=expires,
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, request: Request, db: Session = Depends(db_session)):
    if db.scalar(select(User).where(func.lower(User.email) == body.email.lower())):
        raise conflict("EMAIL_TAKEN", "An account with this email already exists.")
    if body.role == Role.STUDENT and not body.student_id:
        raise bad_request("STUDENT_ID_REQUIRED", "student_id is required for student accounts.")
    if body.student_id and db.scalar(select(User).where(User.student_id == body.student_id)):
        raise conflict("STUDENT_ID_TAKEN", "This student ID is already registered.")

    user = User(
        name=body.name,
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        role=body.role,
        student_id=body.student_id if body.role == Role.STUDENT else None,
        department=body.department if body.role == Role.EVALUATOR else None,
        is_active=True,
    )
    db.add(user)
    db.flush()
    audit_service.record(db, action=AuditAction.LOGIN, user_id=user.id, entity_type="user", entity_id=user.id,
                         metadata={"event": "register"})
    return _issue_tokens(db, user, request)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(db_session)):
    ident = body.login_id
    if not ident:
        raise unauthorized("INVALID_CREDENTIALS", "Enter your email or enrollment number.")
    user = db.scalar(
        select(User).where(
            (func.lower(User.email) == ident.lower()) | (User.student_id == ident)
        )
    )
    if user is None or not verify_password(body.password, user.password_hash):
        raise unauthorized("INVALID_CREDENTIALS", "Email/enrollment or password is incorrect.")
    if not user.is_active:
        raise unauthorized("USER_INACTIVE", "This account has been deactivated.")
    audit_service.record(
        db, action=AuditAction.LOGIN, user_id=user.id, entity_type="user", entity_id=user.id,
        ip=request.client.host if request.client else None,
    )
    return _issue_tokens(db, user, request)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, request: Request, db: Session = Depends(db_session)):
    jti = refresh_jti_from_raw(body.refresh_token)
    if not jti:
        raise unauthorized("INVALID_REFRESH", "Malformed refresh token.")
    token = db.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
    if token is None or token.token_hash != hash_refresh_token(body.refresh_token):
        raise unauthorized("INVALID_REFRESH", "Refresh token not recognised.")
    if token.revoked:
        # Re-use of a rotated token => revoke the whole family (possible theft).
        db.query(RefreshToken).filter(RefreshToken.user_id == token.user_id).update({"revoked": True})
        db.commit()
        raise unauthorized("REFRESH_REUSED", "Refresh token reuse detected. Please log in again.")
    if token.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise unauthorized("REFRESH_EXPIRED", "Refresh token has expired.")

    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise unauthorized("USER_INACTIVE", "User account is not active.")

    # Rotation: revoke the presented token, issue a fresh pair.
    raw, new_jti, new_expires = new_refresh_token()
    token.revoked = True
    token.replaced_by_jti = new_jti
    db.add(
        RefreshToken(
            user_id=user.id, jti=new_jti, token_hash=hash_refresh_token(raw), expires_at=new_expires,
            user_agent=request.headers.get("user-agent", "")[:255],
            ip=request.client.host if request.client else None,
        )
    )
    access, expires = create_access_token(user_id=user.id, role=user.role)
    db.commit()
    return TokenResponse(access_token=access, refresh_token=raw, expires_at=expires, user=UserOut.model_validate(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest, db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    jti = refresh_jti_from_raw(body.refresh_token)
    if jti:
        db.query(RefreshToken).filter(
            RefreshToken.jti == jti, RefreshToken.user_id == user.id
        ).update({"revoked": True})
    audit_service.record(db, action=AuditAction.LOGOUT, user_id=user.id)
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)
