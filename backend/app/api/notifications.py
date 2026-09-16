from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.deps import db_session, get_current_user
from app.core.errors import not_found
from app.models.user import User
from app.schemas import NotificationOut
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    unread_only: bool = Query(False),
    db: Session = Depends(db_session),
    user: User = Depends(get_current_user),
):
    return [NotificationOut.model_validate(n) for n in notification_service.list_for_user(db, user.id, unread_only=unread_only)]


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    if not notification_service.mark_read(db, user.id, notification_id):
        raise not_found("NOTIFICATION_NOT_FOUND", "Notification does not exist.")
    db.commit()


@router.post("/read-all")
def mark_all_read(db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    count = notification_service.mark_all_read(db, user.id)
    db.commit()
    return {"marked_read": count}
