from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import bad_request, forbidden, not_found
from app.models.academic import RubricCriterion
from app.models.enums import AuditAction, ManualEvaluationStatus
from app.models.submission import ManualEvaluation, Submission
from app.services import audit_service
from app.services.assessment_service import evaluator_can_access


def _rubric(db: Session, assessment_id: uuid.UUID) -> list[RubricCriterion]:
    return list(
        db.scalars(
            select(RubricCriterion)
            .where(RubricCriterion.assessment_id == assessment_id)
            .order_by(RubricCriterion.order_index)
        ).all()
    )


def upsert_manual_evaluation(
    db: Session,
    *,
    submission: Submission,
    evaluator_id: uuid.UUID,
    scores: dict[str, float],
    comments: str,
    strengths: str,
    improvements: str,
    status: ManualEvaluationStatus,
) -> ManualEvaluation:
    if not evaluator_can_access(db, evaluator_id, submission.assessment_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this assessment.")

    criteria = _rubric(db, submission.assessment_id)
    by_key = {c.key: c for c in criteria}
    if not by_key:
        raise bad_request("NO_RUBRIC", "This assessment has no rubric.")

    clean: dict[str, float] = {}
    for key, value in scores.items():
        if key not in by_key:
            raise bad_request("BAD_RUBRIC_KEY", f"Unknown rubric criterion: {key}")
        v = float(value)
        if v < 0 or v > by_key[key].max_marks:
            raise bad_request(
                "SCORE_OUT_OF_RANGE",
                f"'{key}' must be between 0 and {by_key[key].max_marks} (got {v}).",
            )
        clean[key] = v

    total = round(sum(clean.values()), 2)  # server-side total; frontend value ignored
    max_total = float(sum(c.max_marks for c in criteria))

    record = db.scalars(
        select(ManualEvaluation).where(ManualEvaluation.submission_id == submission.id)
    ).first()
    if record is None:
        record = ManualEvaluation(submission_id=submission.id, evaluator_id=evaluator_id)
        db.add(record)
    elif record.evaluator_id != evaluator_id:
        raise forbidden("NOT_YOUR_EVALUATION", "This evaluation belongs to another evaluator.")

    record.scores = clean
    record.total = total
    record.max_total = max_total
    record.comments = comments
    record.strengths = strengths
    record.improvements = improvements
    record.status = status
    if status == ManualEvaluationStatus.COMPLETED:
        record.submitted_at = datetime.now(UTC)
    db.flush()

    if status == ManualEvaluationStatus.COMPLETED:
        audit_service.record(
            db,
            action=AuditAction.MANUAL_EVALUATION_SUBMITTED,
            user_id=evaluator_id,
            entity_type="manual_evaluation",
            entity_id=record.id,
            metadata={"total": total, "max_total": max_total},
        )
    return record


def get_manual_evaluation(db: Session, manual_id: uuid.UUID, evaluator_id: uuid.UUID) -> ManualEvaluation:
    m = db.get(ManualEvaluation, manual_id)
    if m is None:
        raise not_found("MANUAL_EVALUATION_NOT_FOUND", "Manual evaluation does not exist.")
    if m.evaluator_id != evaluator_id:
        raise forbidden("NOT_YOUR_EVALUATION", "This evaluation belongs to another evaluator.")
    return m
