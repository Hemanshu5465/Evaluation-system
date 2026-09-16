from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.enums import AuditAction
from app.models.system import AuditLog


def record(
    db: Session,
    *,
    action: AuditAction | str,
    user_id: uuid.UUID | None = None,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    metadata: dict | None = None,
    ip: str | None = None,
) -> AuditLog:
    log = AuditLog(
        user_id=user_id,
        action=str(action),
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=metadata or {},
        ip=ip,
    )
    db.add(log)
    db.flush()
    return log
