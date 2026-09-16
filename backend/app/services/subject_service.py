from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import conflict, not_found
from app.models.academic import Subject


def list_subjects(db: Session, *, include_inactive: bool = True) -> list[Subject]:
    stmt = select(Subject).order_by(Subject.created_at)
    if not include_inactive:
        stmt = stmt.where(Subject.is_active.is_(True))
    return list(db.scalars(stmt).all())


def get_subject(db: Session, subject_id: uuid.UUID) -> Subject:
    s = db.get(Subject, subject_id)
    if s is None:
        raise not_found("SUBJECT_NOT_FOUND", "Subject does not exist.")
    return s


def create_subject(
    db: Session, *, name: str, code: str, description: str, created_by: uuid.UUID, semester: str = ""
) -> Subject:
    active = db.scalar(select(func.count()).select_from(Subject).where(Subject.is_active.is_(True))) or 0
    if active >= settings.MAX_ACTIVE_SUBJECTS:
        raise conflict(
            "SUBJECT_LIMIT_REACHED",
            f"Maximum of {settings.MAX_ACTIVE_SUBJECTS} active subjects reached. Archive one first.",
        )
    if db.scalar(select(Subject).where(func.lower(Subject.code) == code.lower())):
        raise conflict("SUBJECT_CODE_TAKEN", "A subject with this code already exists.")
    s = Subject(name=name, code=code, semester=semester, description=description, created_by=created_by, is_active=True)
    db.add(s)
    db.flush()
    return s


def update_subject(db: Session, subject_id: uuid.UUID, **fields) -> Subject:
    s = get_subject(db, subject_id)
    if fields.get("is_active") and not s.is_active:
        active = db.scalar(select(func.count()).select_from(Subject).where(Subject.is_active.is_(True))) or 0
        if active >= settings.MAX_ACTIVE_SUBJECTS:
            raise conflict("SUBJECT_LIMIT_REACHED", f"Maximum of {settings.MAX_ACTIVE_SUBJECTS} active subjects.")
    code = fields.get("code")
    if code and code.lower() != s.code.lower():
        if db.scalar(select(Subject).where(func.lower(Subject.code) == code.lower(), Subject.id != s.id)):
            raise conflict("SUBJECT_CODE_TAKEN", "Another subject already uses this code.")
    for k, v in fields.items():
        if v is not None:
            setattr(s, k, v)
    db.flush()
    return s


def delete_subject(db: Session, subject_id: uuid.UUID) -> None:
    s = get_subject(db, subject_id)
    if s.assessments:
        # Soft-delete when history exists to preserve referential integrity.
        s.is_active = False
        db.flush()
        return
    db.delete(s)
    db.flush()
