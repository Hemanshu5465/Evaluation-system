from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import db_session, get_current_user
from app.core.errors import forbidden, not_found
from app.models.enums import Role
from app.models.system import Job
from app.models.user import User
from app.schemas import JobOut

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(get_current_user)):
    job = db.get(Job, job_id)
    if job is None:
        raise not_found("JOB_NOT_FOUND", "Job does not exist.")
    # Admins see any job; others only see jobs they created.
    if user.role != Role.ADMIN and job.created_by != user.id:
        raise forbidden("JOB_FORBIDDEN", "You cannot view this job.")
    return JobOut.model_validate(job)
