from __future__ import annotations

import uuid

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.enums import NotificationType
from app.models.system import Notification


def notify(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str,
    message: str,
    ntype: NotificationType | str,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id,
        title=title,
        message=message,
        type=str(ntype),
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(n)
    db.flush()
    return n


def list_for_user(db: Session, user_id: uuid.UUID, *, unread_only: bool = False) -> list[Notification]:
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    return list(db.scalars(stmt.order_by(Notification.created_at.desc())).all())


def mark_read(db: Session, user_id: uuid.UUID, notification_id: uuid.UUID) -> bool:
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user_id:
        return False
    n.is_read = True
    db.flush()
    return True


def mark_all_read(db: Session, user_id: uuid.UUID) -> int:
    res = db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    return res.rowcount or 0
