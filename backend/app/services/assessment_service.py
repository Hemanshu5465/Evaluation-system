from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import bad_request, conflict, not_found
from app.models.academic import (
    Assessment,
    AssessmentEvaluator,
    AssessmentStudent,
    Question,
    QuestionPart,
    RubricCriterion,
    Subject,
)
from app.models.enums import AssessmentStatus, ProcessingStatus, Role
from app.models.user import User
from app.services import audit_service, notification_service


def get_assessment(db: Session, assessment_id: uuid.UUID, *, eager: bool = True) -> Assessment:
    stmt = select(Assessment).where(Assessment.id == assessment_id)
    if eager:
        stmt = stmt.options(
            selectinload(Assessment.question).selectinload(Question.parts),
            selectinload(Assessment.rubric_criteria),
            selectinload(Assessment.evaluator_links),
            selectinload(Assessment.student_links),
        )
    a = db.scalars(stmt).first()
    if a is None:
        raise not_found("ASSESSMENT_NOT_FOUND", "Assessment does not exist.")
    return a


def create_assessment(
    db: Session, *, subject: Subject, title: str, difficulty: str, deadline: datetime | None, actor_id: uuid.UUID
) -> Assessment:
    if subject.syllabus is None or subject.syllabus.processing_status != ProcessingStatus.PROCESSED:
        raise bad_request("SYLLABUS_NOT_READY", "Upload and process the subject syllabus before creating an assessment.")
    a = Assessment(
        title=title,
        subject_id=subject.id,
        difficulty=difficulty,
        status=AssessmentStatus.DRAFT,
        deadline=deadline,
        created_by=actor_id,
    )
    db.add(a)
    db.flush()
    audit_service.record(db, action="ASSESSMENT_CREATED", user_id=actor_id, entity_type="assessment", entity_id=a.id)
    return a


def delete_assessment(db: Session, assessment_id: uuid.UUID, *, actor_id: uuid.UUID) -> None:
    """Delete a generated question / assessment and everything hanging off it —
    the question and its parts, rubric, per-student scenarios, evaluator/student
    links, and any submissions with their evaluations. Caller commits."""
    from app.models.submission import Submission

    a = get_assessment(db, assessment_id)
    for sub in db.scalars(select(Submission).where(Submission.assessment_id == assessment_id)).all():
        db.delete(sub)
    db.flush()
    db.delete(a)  # ORM cascade handles question / rubric / scenarios / links
    db.flush()
    audit_service.record(
        db, action="ASSESSMENT_DELETED", user_id=actor_id, entity_type="assessment", entity_id=assessment_id
    )


def apply_generated_question(db: Session, assessment: Assessment, result) -> Assessment:
    """Persist a validated QuestionGenResult onto the assessment."""
    if assessment.question is not None:
        db.delete(assessment.question)
        db.flush()
    for rc in list(assessment.rubric_criteria):
        db.delete(rc)
    db.flush()

    q = Question(
        assessment_id=assessment.id,
        title=result.title,
        common_prompt=result.common_prompt,
        instructions=result.instructions,
        constraints=result.constraints,
        expected_files=result.expected_files,
        learning_objectives=result.learning_objectives,
    )
    db.add(q)
    db.flush()
    for p in result.parts:
        db.add(
            QuestionPart(
                question_id=q.id,
                part_number=p.part_number,
                label=f"Part {chr(64 + p.part_number)}",
                prompt=p.prompt,
                expected_concept=p.expected_concept,
                marks=p.marks,
            )
        )
    for i, c in enumerate(result.evaluation_rubric):
        db.add(
            RubricCriterion(
                assessment_id=assessment.id, key=c.key, name=c.name, max_marks=c.max_marks, order_index=i
            )
        )
    assessment.difficulty = result.difficulty
    assessment.status = AssessmentStatus.READY
    assessment.generation_error = None
    db.flush()
    return assessment


def assign(
    db: Session,
    assessment: Assessment,
    *,
    evaluator_ids: list[uuid.UUID] | None,
    student_ids: list[uuid.UUID] | None,
) -> Assessment:
    if evaluator_ids is not None:
        _replace_links(db, AssessmentEvaluator, "evaluator_id", assessment, evaluator_ids, Role.EVALUATOR)
    if student_ids is not None:
        _replace_links(db, AssessmentStudent, "student_id", assessment, student_ids, Role.STUDENT)
    db.flush()
    # links are created by FK, not via the ORM collections — expire so any
    # already-loaded instance re-reads them instead of serving a stale list.
    db.expire(assessment, ["student_links", "evaluator_links"])
    return get_assessment(db, assessment.id)


def _replace_links(db: Session, model, field: str, assessment: Assessment, ids: list[uuid.UUID], role: Role):
    users = db.scalars(select(User).where(User.id.in_(ids))).all()
    found = {u.id for u in users if u.role == role.value and u.is_active}
    missing = set(ids) - found
    if missing:
        raise bad_request("INVALID_ASSIGNEE", f"Not valid active {role.value.lower()} accounts: {missing}")
    existing = db.scalars(select(model).where(model.assessment_id == assessment.id)).all()
    for link in existing:
        db.delete(link)
    db.flush()
    for uid in ids:
        db.add(model(assessment_id=assessment.id, **{field: uid}))


def publish(
    db: Session, assessment: Assessment, *, actor_id: uuid.UUID, duration_minutes: int | None = None
) -> Assessment:
    if assessment.status == AssessmentStatus.PUBLISHED:
        raise conflict("ALREADY_PUBLISHED", "Assessment is already published.")
    if assessment.status not in {AssessmentStatus.READY, AssessmentStatus.DRAFT}:
        raise conflict("BAD_STATE", f"Cannot publish an assessment in state {assessment.status}.")
    if assessment.question is None:
        raise bad_request("NO_QUESTION", "Generate the question before publishing.")
    if not assessment.rubric_criteria:
        raise bad_request("NO_RUBRIC", "The assessment has no evaluation rubric.")
    if not assessment.student_links:
        raise bad_request("NO_STUDENTS", "There are no students to publish to. Import the roster first.")
    # Evaluators are optional at publish time — they can be assigned later.

    # Per-student scenarios are generated by a background job (one LLM call each),
    # and self-heal on first access if the job hasn't caught up. Publish stays instant.
    assessment.status = AssessmentStatus.PUBLISHED
    assessment.published_at = datetime.now(UTC)
    assessment.duration_minutes = duration_minutes
    db.flush()

    audit_service.record(
        db, action="ASSESSMENT_PUBLISHED", user_id=actor_id, entity_type="assessment", entity_id=assessment.id
    )
    for link in assessment.student_links:
        notification_service.notify(
            db,
            user_id=link.student_id,
            title="New assessment published",
            message=f"'{assessment.title}' is now available. Open it to see your scenario.",
            ntype="ASSESSMENT_PUBLISHED",
            entity_type="assessment",
            entity_id=assessment.id,
        )
    return assessment


def student_assessments(db: Session, student_id: uuid.UUID) -> list[Assessment]:
    # A published scenario assessment is the same one question for every student —
    # it's visible on every student's dashboard, no per-student assignment needed.
    stmt = (
        select(Assessment)
        .where(Assessment.status == AssessmentStatus.PUBLISHED)
        .options(selectinload(Assessment.question).selectinload(Question.parts), selectinload(Assessment.rubric_criteria))
        .order_by(Assessment.published_at.desc())
    )
    return list(db.scalars(stmt).all())


def evaluator_can_access(db: Session, evaluator_id: uuid.UUID, assessment_id: uuid.UUID) -> bool:
    return db.scalar(
        select(AssessmentEvaluator).where(
            AssessmentEvaluator.assessment_id == assessment_id,
            AssessmentEvaluator.evaluator_id == evaluator_id,
        )
    ) is not None


def student_assigned(db: Session, student_id: uuid.UUID, assessment_id: uuid.UUID) -> bool:
    a = db.get(Assessment, assessment_id)
    if a is not None and a.status == AssessmentStatus.PUBLISHED:
        return True  # every student can access any published assessment
    return db.scalar(
        select(AssessmentStudent).where(
            AssessmentStudent.assessment_id == assessment_id,
            AssessmentStudent.student_id == student_id,
        )
    ) is not None


def _aware(dt: datetime | None) -> datetime | None:
    """SQLite drops tzinfo on round-trip even for DateTime(timezone=True) columns —
    every value we write is UTC, so re-attach it before doing any arithmetic."""
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=UTC)


def _expires_at(started_at: datetime | None, duration_minutes: int | None) -> datetime | None:
    started_at = _aware(started_at)
    if started_at is None or not duration_minutes:
        return None
    return started_at + timedelta(minutes=duration_minutes)


def start_attempt(db: Session, *, assessment_id: uuid.UUID, student_id: uuid.UUID) -> AssessmentStudent:
    """Record the first time THIS student opens a timed question. Idempotent —
    calling it again just returns the existing start time, never resets the clock."""
    link = db.scalar(
        select(AssessmentStudent).where(
            AssessmentStudent.assessment_id == assessment_id, AssessmentStudent.student_id == student_id
        )
    )
    if link is None:
        # Defensive: publish() always creates this link for every student, but
        # guard against the self-heal / edge-case path where it might not exist yet.
        link = AssessmentStudent(assessment_id=assessment_id, student_id=student_id)
        db.add(link)
        db.flush()
    if link.started_at is None:
        link.started_at = datetime.now(UTC)
        db.flush()
    return link


def time_status(db: Session, assessment: Assessment, student_id: uuid.UUID) -> dict:
    """started_at / expires_at / expired for this student on this assessment.
    Returns all-None (never expired) when the assessment has no time limit."""
    link = db.scalar(
        select(AssessmentStudent).where(
            AssessmentStudent.assessment_id == assessment.id, AssessmentStudent.student_id == student_id
        )
    )
    started_at = _aware(link.started_at if link else None)
    expires_at = _expires_at(started_at, assessment.duration_minutes)
    expired = bool(expires_at and datetime.now(UTC) >= expires_at)
    return {"started_at": started_at, "expires_at": expires_at, "expired": expired}
