from __future__ import annotations

import hashlib
import time
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import forbidden, not_found
from app.core.logging import logger
from app.models.academic import Assessment, AssessmentStudent, StudentScenario
from app.ai.scenario_generator import PROMPT_VERSION, generate_scenario, scenario_hash


def _generate_one(
    db: Session, assessment: Assessment, student_id: uuid.UUID, *, used_domains: list[str], index: int
) -> StudentScenario:
    seed = hashlib.sha256(f"{assessment.id}:{student_id}".encode()).hexdigest()[:16]
    result = generate_scenario(
        common_prompt=assessment.question.common_prompt,
        learning_objectives=assessment.question.learning_objectives,
        difficulty=assessment.difficulty,
        assessment_key=str(assessment.id),
        student_key=seed,
        used_domains=used_domains,
    )
    payload = result.model_dump()
    scn = StudentScenario(
        assessment_id=assessment.id,
        student_id=student_id,
        scenario_code=f"SCN-{str(assessment.id)[:4].upper()}-{index:03d}",
        title=result.title,
        domain=result.domain,
        scenario_text=result.scenario_text,
        scenario_variables={
            "entities": [e.model_dump() for e in result.entities],
            **result.variables,
            "sample_records_note": result.sample_records_note,
        },
        scenario_hash=scenario_hash(payload),
        prompt_version=PROMPT_VERSION,
    )
    db.add(scn)
    db.flush()
    return scn


def ensure_scenarios(db: Session, assessment: Assessment, *, progress=None) -> list[StudentScenario]:
    """Create a stored, unique scenario for every assigned student. Idempotent.

    Slow (one LLM call per student) — run this from a background job, not an HTTP request.
    """
    if assessment.question is None:
        raise not_found("NO_QUESTION", "Assessment has no question yet.")

    existing = {
        s.student_id: s
        for s in db.scalars(select(StudentScenario).where(StudentScenario.assessment_id == assessment.id)).all()
    }
    student_ids = [
        l.student_id
        for l in db.scalars(select(AssessmentStudent).where(AssessmentStudent.assessment_id == assessment.id)).all()
    ]
    used_domains = [s.domain for s in existing.values()]
    created: list[StudentScenario] = []
    todo = [sid for sid in student_ids if sid not in existing]

    for i, sid in enumerate(todo):
        if i and settings.AI_SCENARIO_GEN_DELAY_MS:
            time.sleep(settings.AI_SCENARIO_GEN_DELAY_MS / 1000)
        # a student may have self-healed their own scenario since we started
        if db.scalar(
            select(StudentScenario.id).where(
                StudentScenario.assessment_id == assessment.id, StudentScenario.student_id == sid
            )
        ):
            continue
        try:
            scn = _generate_one(db, assessment, sid, used_domains=used_domains, index=len(existing) + i + 1)
            db.commit()
            used_domains.append(scn.domain)
            created.append(scn)
        except Exception as e:  # keep going; a failed scenario is retried on demand
            db.rollback()
            logger.warning("scenario generation failed for student %s: %s", sid, e)
        if progress:
            progress(round((i + 1) / max(len(todo), 1) * 100), f"Generated {i + 1}/{len(todo)} scenarios")
    return created + list(existing.values())


def get_student_scenario(
    db: Session, *, assessment_id: uuid.UUID, student_id: uuid.UUID, generate_if_missing: bool = True
) -> StudentScenario:
    scn = db.scalar(
        select(StudentScenario).where(
            StudentScenario.assessment_id == assessment_id,
            StudentScenario.student_id == student_id,
        )
    )
    if scn is not None:
        return scn
    if not generate_if_missing:
        raise not_found("SCENARIO_NOT_FOUND", "No scenario has been assigned to you for this assessment.")

    # Self-heal: generate just this student's scenario on first access.
    assessment = db.get(Assessment, assessment_id)
    if assessment is None or assessment.question is None:
        raise not_found("SCENARIO_NOT_FOUND", "No scenario available for this assessment.")
    from app.models.enums import AssessmentStatus

    linked = db.scalar(
        select(AssessmentStudent).where(
            AssessmentStudent.assessment_id == assessment_id, AssessmentStudent.student_id == student_id
        )
    )
    if not linked:
        if assessment.status != AssessmentStatus.PUBLISHED:
            raise forbidden("NOT_ASSIGNED", "This assessment is not assigned to you.")
        # published assessment reaches every student — record the link so views stay consistent
        db.add(AssessmentStudent(assessment_id=assessment_id, student_id=student_id))
        db.flush()

    used_domains = [
        d
        for (d,) in db.execute(
            select(StudentScenario.domain).where(StudentScenario.assessment_id == assessment_id)
        ).all()
    ]
    count = db.scalar(
        select(func.count()).select_from(StudentScenario).where(StudentScenario.assessment_id == assessment_id)
    ) or 0
    try:
        scn = _generate_one(db, assessment, student_id, used_domains=used_domains, index=count + 1)
        db.commit()
        return scn
    except Exception:
        # a concurrent background job may have created it first
        db.rollback()
        scn = db.scalar(
            select(StudentScenario).where(
                StudentScenario.assessment_id == assessment_id,
                StudentScenario.student_id == student_id,
            )
        )
        if scn is None:
            raise
        return scn


def assert_owns_scenario(scenario: StudentScenario, student_id: uuid.UUID) -> None:
    if scenario.student_id != student_id:
        raise forbidden("SCENARIO_FORBIDDEN", "You cannot access another student's scenario.")
