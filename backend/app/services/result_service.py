from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, forbidden, not_found
from app.models.enums import EvaluationStage
from app.models.submission import AIEvaluation, Submission


AI_CONTENT_DISCLAIMER = (
    "This is an automated, probabilistic indicator derived from stylistic and structural signals. "
    "It is not definitive proof that any part of the submission was AI-generated and must not be the "
    "sole basis for an academic-integrity decision."
)


def student_result(db: Session, *, submission_id: uuid.UUID, student_id: uuid.UUID) -> dict:
    submission = db.scalars(
        select(Submission).where(Submission.id == submission_id)
    ).first()
    if submission is None:
        raise not_found("SUBMISSION_NOT_FOUND", "Submission does not exist.")
    if submission.student_id != student_id:
        raise forbidden("NOT_OWNER", "This submission is not yours.")

    ev = db.scalars(
        select(AIEvaluation)
        .where(AIEvaluation.submission_id == submission.id, AIEvaluation.published.is_(True))
        .order_by(AIEvaluation.version.desc())
        .options(selectinload(AIEvaluation.test_cases))
    ).first()

    if ev is None:
        raise AppError(
            403,
            "RESULT_NOT_PUBLISHED",
            "Your result has not been published yet. Your evaluator reviews the AI evaluation before releasing it.",
        )

    # NOTE: manual_evaluation (evaluator private marks/comments/strengths/improvements) is
    # deliberately never read here. Only published AI data is exposed to the student.
    return {
        "submission_id": str(submission.id),
        "assessment_id": str(submission.assessment_id),
        "status": "PUBLISHED",
        "published_at": ev.published_at.isoformat() if ev.published_at else None,
        "ai_score": ev.overall_score,
        "max_score": ev.max_score,
        "confidence": ev.confidence,
        "rubric_scores": [
            {"key": r["key"], "name": r["name"], "score": r["score"], "max_score": r["max_score"], "evidence": r.get("evidence", [])}
            for r in ev.rubric_scores
        ],
        "test_cases": [
            {
                "code": tc.code,
                "name": tc.name,
                "description": tc.description,
                "expected": tc.expected,
                "actual": tc.actual,
                "passed": tc.passed,
                "score": tc.score,
                "max_score": tc.max_score,
                "explanation": tc.explanation,
            }
            for tc in sorted(ev.test_cases, key=lambda t: t.code)
        ],
        "tests_passed": sum(1 for tc in ev.test_cases if tc.passed),
        "tests_failed": sum(1 for tc in ev.test_cases if not tc.passed),
        "strengths": ev.strengths,
        "weaknesses": ev.weaknesses,
        "recommendations": ev.recommendations,
        "explanation": ev.explanation,
        "ai_content": {
            "estimated_probability": ev.ai_content_probability,
            "classification": ev.ai_content_classification,
            "confidence": ev.ai_content_confidence,
            "evidence": ev.ai_content_evidence,
            "disclaimer": AI_CONTENT_DISCLAIMER,
        },
    }


def is_published(ev: AIEvaluation | None) -> bool:
    return bool(ev and ev.published and ev.stage == EvaluationStage.PUBLISHED)
