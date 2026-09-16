from __future__ import annotations

import uuid

from app.workers import runners
from app.workers.celery_app import celery_app
from app.workers.jobs import run_job


@celery_app.task(name="assessment.generate_question")
def generate_question_task(
    job_id: str, assessment_id: str, difficulty: str, topics: list[str], number_of_parts: int,
    class_coverage: str | None = None,
) -> None:
    run_job(
        uuid.UUID(job_id),
        lambda db, p: runners.question_generation_run(
            db, p, assessment_id=assessment_id, difficulty=difficulty, topics=topics,
            number_of_parts=number_of_parts, class_coverage=class_coverage,
        ),
    )


@celery_app.task(name="assessment.generate_scenarios")
def generate_scenarios_task(job_id: str, assessment_id: str) -> None:
    run_job(uuid.UUID(job_id), lambda db, p: runners.scenario_generation_run(db, p, assessment_id=assessment_id))
