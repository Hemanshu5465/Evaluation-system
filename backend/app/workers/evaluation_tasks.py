from __future__ import annotations

import uuid

from app.workers import runners
from app.workers.celery_app import celery_app
from app.workers.jobs import run_job


@celery_app.task(name="evaluation.run_ai")
def run_ai_evaluation_task(job_id: str, evaluation_id: str) -> None:
    run_job(uuid.UUID(job_id), lambda db, p: runners.ai_evaluation_run(db, p, evaluation_id=evaluation_id))
