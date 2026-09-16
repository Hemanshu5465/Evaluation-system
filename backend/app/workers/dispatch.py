from __future__ import annotations

import threading
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.system import Job
from app.workers import runners
from app.workers.jobs import create_job, run_inline, run_job


def _dispatch(db: Session, job: Job, *, work, celery_send, background_in_eager: bool = False) -> Job:
    """Eager: run now on the request session (or a daemon thread for long jobs).
    Otherwise enqueue to Celery."""
    db.commit()  # persist the job row before handing work off
    if settings.celery_eager:
        if background_in_eager:
            job_id = job.id
            threading.Thread(target=run_job, args=(job_id, work), daemon=True).start()
        else:
            run_inline(db, job.id, work)
            db.commit()
    else:
        celery_send()
    return db.get(Job, job.id)


def dispatch_syllabus_processing(db: Session, *, syllabus_id: uuid.UUID, actor_id: uuid.UUID) -> Job:
    job = create_job(db, kind="syllabus.process", entity_type="syllabus", entity_id=syllabus_id, created_by=actor_id)

    def work(session, progress):
        return runners.syllabus_run(session, progress, syllabus_id=str(syllabus_id))

    def send():
        from app.workers.syllabus_tasks import process_syllabus_task

        process_syllabus_task.delay(str(job.id), str(syllabus_id))

    return _dispatch(db, job, work=work, celery_send=send)


def dispatch_question_generation(
    db: Session, *, assessment_id: uuid.UUID, difficulty: str, topics: list[str], number_of_parts: int,
    actor_id: uuid.UUID, class_coverage: str | None = None,
) -> Job:
    job = create_job(db, kind="assessment.generate_question", entity_type="assessment", entity_id=assessment_id, created_by=actor_id)

    def work(session, progress):
        return runners.question_generation_run(
            session, progress, assessment_id=str(assessment_id), difficulty=difficulty,
            topics=topics, number_of_parts=number_of_parts, class_coverage=class_coverage,
        )

    def send():
        from app.workers.assessment_tasks import generate_question_task

        generate_question_task.delay(str(job.id), str(assessment_id), difficulty, topics, number_of_parts, class_coverage)

    return _dispatch(db, job, work=work, celery_send=send)


def dispatch_scenario_generation(db: Session, *, assessment_id: uuid.UUID, actor_id: uuid.UUID) -> Job:
    job = create_job(
        db, kind="assessment.generate_scenarios", entity_type="assessment", entity_id=assessment_id, created_by=actor_id
    )

    def work(session, progress):
        return runners.scenario_generation_run(session, progress, assessment_id=str(assessment_id))

    def send():
        from app.workers.assessment_tasks import generate_scenarios_task

        generate_scenarios_task.delay(str(job.id), str(assessment_id))

    # One LLM call per student — always off the request path.
    return _dispatch(db, job, work=work, celery_send=send, background_in_eager=True)


def dispatch_ai_evaluation(db: Session, *, evaluation_id: uuid.UUID, actor_id: uuid.UUID) -> Job:
    job = create_job(db, kind="evaluation.run_ai", entity_type="ai_evaluation", entity_id=evaluation_id, created_by=actor_id)

    def work(session, progress):
        return runners.ai_evaluation_run(session, progress, evaluation_id=str(evaluation_id))

    def send():
        from app.workers.evaluation_tasks import run_ai_evaluation_task

        run_ai_evaluation_task.delay(str(job.id), str(evaluation_id))

    return _dispatch(db, job, work=work, celery_send=send)


def dispatch_project_evaluation(db: Session, *, evaluation_id: uuid.UUID, actor_id: uuid.UUID) -> Job:
    job = create_job(db, kind="project.run_ai", entity_type="project_evaluation", entity_id=evaluation_id, created_by=actor_id)

    def work(session, progress):
        return runners.project_evaluation_run(session, progress, evaluation_id=str(evaluation_id))

    def send():
        from app.workers.project_tasks import run_project_evaluation_task

        run_project_evaluation_task.delay(str(job.id), str(evaluation_id))

    return _dispatch(db, job, work=work, celery_send=send)
