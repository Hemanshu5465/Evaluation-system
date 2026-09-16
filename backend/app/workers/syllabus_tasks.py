from __future__ import annotations

import uuid

from app.workers import runners
from app.workers.celery_app import celery_app
from app.workers.jobs import run_job


@celery_app.task(name="syllabus.process")
def process_syllabus_task(job_id: str, syllabus_id: str) -> None:
    run_job(uuid.UUID(job_id), lambda db, p: runners.syllabus_run(db, p, syllabus_id=syllabus_id))
