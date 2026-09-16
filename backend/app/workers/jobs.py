from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Callable

from sqlalchemy.orm import Session

from app.core.database import session_scope
from app.core.logging import logger
from app.models.enums import JobStatus
from app.models.system import Job

Work = Callable[[Session, Callable[[int, str], None]], dict | None]


def create_job(
    db: Session, *, kind: str, entity_type: str | None = None, entity_id: uuid.UUID | None = None,
    created_by: uuid.UUID | None = None,
) -> Job:
    job = Job(kind=kind, status=JobStatus.QUEUED, entity_type=entity_type, entity_id=entity_id, created_by=created_by)
    db.add(job)
    db.flush()
    return job


def run_inline(db: Session, job_id: uuid.UUID, work: Work) -> None:
    """Execute `work` on the caller's session (eager mode). Caller commits."""
    job = db.get(Job, job_id)
    job.status = JobStatus.RUNNING
    job.started_at = datetime.now(UTC)
    db.flush()

    def progress(pct: int, stage: str) -> None:
        job.progress = pct
        job.stage = stage
        db.flush()

    try:
        result = work(db, progress) or {}
        job.status = JobStatus.COMPLETED
        job.progress = 100
        job.result = result
        job.completed_at = datetime.now(UTC)
        db.flush()
    except Exception as e:
        logger.exception("inline job %s failed", job_id)
        db.rollback()
        j = db.get(Job, job_id)
        if j:
            j.status = JobStatus.FAILED
            j.error = str(e)[:2000]
            j.completed_at = datetime.now(UTC)
            db.flush()


def run_job(job_id: uuid.UUID, work: Work) -> None:
    """Celery worker path: owns its own sessions/transactions."""
    with session_scope() as db:
        job = db.get(Job, job_id)
        if job is None:
            logger.error("run_job: job %s not found", job_id)
            return
        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(UTC)

    def progress(pct: int, stage: str) -> None:
        with session_scope() as inner:
            j = inner.get(Job, job_id)
            if j:
                j.progress = pct
                j.stage = stage

    try:
        with session_scope() as db:
            result = work(db, progress) or {}
        with session_scope() as db:
            j = db.get(Job, job_id)
            j.status = JobStatus.COMPLETED
            j.progress = 100
            j.result = result
            j.completed_at = datetime.now(UTC)
    except Exception as e:  # pragma: no cover
        logger.exception("job %s failed", job_id)
        with session_scope() as db:
            j = db.get(Job, job_id)
            if j:
                j.status = JobStatus.FAILED
                j.error = str(e)[:2000]
                j.completed_at = datetime.now(UTC)
