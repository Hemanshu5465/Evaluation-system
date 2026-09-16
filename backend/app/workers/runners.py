"""Pipeline entry points shared by the Celery workers and the inline (eager) path.

Each function takes an open Session plus a `progress(pct, stage)` callback and
returns a small result dict. It must NOT open its own session or commit — the
caller (Celery `run_job` or inline dispatch) owns the transaction.
"""

from __future__ import annotations

import uuid
from typing import Callable

from sqlalchemy.orm import Session

Progress = Callable[[int, str], None]


def syllabus_run(db: Session, progress: Progress, *, syllabus_id: str) -> dict:
    from app.services.syllabus_service import process_syllabus

    s = process_syllabus(db, uuid.UUID(syllabus_id), progress=progress)
    return {"syllabus_id": str(s.id), "topics": len(s.topics), "status": s.processing_status}


def scenario_generation_run(db: Session, progress: Progress, *, assessment_id: str) -> dict:
    from app.models.academic import Assessment
    from app.services.scenario_service import ensure_scenarios

    assessment = db.get(Assessment, uuid.UUID(assessment_id))
    if assessment is None:
        return {"assessment_id": assessment_id, "scenarios": 0}
    scenarios = ensure_scenarios(db, assessment, progress=progress)
    return {"assessment_id": assessment_id, "scenarios": len(scenarios)}


def question_generation_run(
    db: Session, progress: Progress, *, assessment_id: str, difficulty: str, topics: list[str], number_of_parts: int,
    class_coverage: str | None = None,
) -> dict:
    from app.ai.question_generator import generate_question
    from app.models.academic import Assessment
    from app.models.enums import AssessmentStatus
    from app.services.assessment_service import apply_generated_question

    assessment = db.get(Assessment, uuid.UUID(assessment_id))
    assessment.status = AssessmentStatus.GENERATING
    db.flush()
    progress(25, "Reading syllabus context")
    subject = assessment.subject
    syllabus = subject.syllabus
    progress(50, "Generating question")
    try:
        result = generate_question(
            subject_name=subject.name,
            syllabus_title=syllabus.title,
            syllabus_topics=[t.name for t in syllabus.topics],
            learning_outcomes=syllabus.learning_outcomes,
            extracted_text=syllabus.extracted_text or "",
            difficulty=difficulty,
            selected_topics=topics,
            number_of_parts=number_of_parts,
            class_coverage=class_coverage,
        )
    except Exception as e:
        assessment.status = AssessmentStatus.DRAFT
        assessment.generation_error = str(e)[:2000]
        db.flush()
        raise
    progress(85, "Saving question and rubric")
    apply_generated_question(db, assessment, result)
    # Keep the difficulty exactly as the admin picked — never let the model's own
    # self-reported value in its JSON drift from what was actually requested.
    assessment.difficulty = difficulty.upper()
    return {"assessment_id": assessment_id, "parts": len(result.parts), "status": "READY"}


def ai_evaluation_run(db: Session, progress: Progress, *, evaluation_id: str) -> dict:
    from app.services.ai_evaluation_service import run_pipeline

    progress(5, "Queued")
    ev = run_pipeline(db, uuid.UUID(evaluation_id))
    return {"evaluation_id": str(ev.id), "stage": ev.stage, "score": ev.overall_score}


def project_evaluation_run(db: Session, progress: Progress, *, evaluation_id: str) -> dict:
    from app.services.project_evaluation_service import run_pipeline

    progress(5, "Queued")
    ev = run_pipeline(db, uuid.UUID(evaluation_id))
    return {"evaluation_id": str(ev.id), "stage": ev.stage, "score": ev.overall_score}
