from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.ai.answer_evaluator import PROMPT_VERSION as EVAL_VERSION
from app.ai.answer_evaluator import evaluate_answer
from app.ai.provider import get_eval_provider
from app.core.config import settings
from app.core.errors import bad_request, conflict, forbidden, not_found
from app.models.academic import Assessment, RubricCriterion, StudentScenario
from app.models.enums import (
    EVALUATION_STAGE_ORDER,
    AuditAction,
    EvaluationStage,
    SubmissionStatus,
)
from app.models.submission import AIEvaluation, AITestCase, Submission
from app.services import audit_service, code_analysis_service, notification_service, submission_service
from app.services.assessment_service import evaluator_can_access

_ACTIVE = {EvaluationStage.QUEUED, EvaluationStage.EXTRACTING, EvaluationStage.FILE_ANALYSIS,
           EvaluationStage.SYNTAX_CHECK, EvaluationStage.TEST_CASES, EvaluationStage.LOGIC_ANALYSIS,
           EvaluationStage.RUBRIC_ANALYSIS, EvaluationStage.AI_CONTENT_ANALYSIS, EvaluationStage.SCORING,
           EvaluationStage.REPORT_GENERATION}


@dataclass
class _AIContent:
    estimated_probability: float
    classification: str
    confidence: float
    evidence: list[str] = field(default_factory=list)


def start_ai_evaluation(
    db: Session, *, submission: Submission, evaluator_id: uuid.UUID, force_new_version: bool = False
) -> AIEvaluation:
    if submission.status != SubmissionStatus.SUBMITTED:
        raise bad_request("NOT_SUBMITTED", "The student has not submitted this solution yet.")
    if not evaluator_can_access(db, evaluator_id, submission.assessment_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this assessment.")

    latest = db.scalars(
        select(AIEvaluation).where(AIEvaluation.submission_id == submission.id).order_by(AIEvaluation.version.desc())
    ).first()

    if latest and not force_new_version:
        if latest.stage in _ACTIVE:
            raise conflict("EVALUATION_IN_PROGRESS", "An AI evaluation is already running for this submission.")
        if latest.stage in (EvaluationStage.COMPLETED, EvaluationStage.PUBLISHED):
            return latest  # idempotent

    version = (latest.version + 1) if latest else 1
    ev = AIEvaluation(
        submission_id=submission.id,
        version=version,
        stage=EvaluationStage.QUEUED,
        progress=0,
        stage_history=[{"stage": EvaluationStage.QUEUED, "at": datetime.now(UTC).isoformat()}],
        started_by=evaluator_id,
        provider=get_eval_provider().name,
        prompt_version=EVAL_VERSION,
    )
    db.add(ev)
    db.flush()
    audit_service.record(
        db, action=AuditAction.AI_EVALUATION_STARTED, user_id=evaluator_id,
        entity_type="ai_evaluation", entity_id=ev.id, metadata={"version": version},
    )
    return ev


def _advance(db: Session, ev: AIEvaluation, stage: EvaluationStage) -> None:
    ev.stage = stage
    idx = EVALUATION_STAGE_ORDER.index(stage) if stage in EVALUATION_STAGE_ORDER else len(EVALUATION_STAGE_ORDER)
    ev.progress = min(100, round(idx / (len(EVALUATION_STAGE_ORDER) - 1) * 100))
    ev.stage_history = [*ev.stage_history, {"stage": stage, "at": datetime.now(UTC).isoformat()}]
    db.flush()


def run_pipeline(db: Session, evaluation_id: uuid.UUID) -> AIEvaluation:
    """Executed by a background worker. Never inside an HTTP request."""
    ev = db.scalars(
        select(AIEvaluation).where(AIEvaluation.id == evaluation_id).options(selectinload(AIEvaluation.test_cases))
    ).first()
    if ev is None:
        raise not_found("EVALUATION_NOT_FOUND", "Evaluation does not exist.")

    submission = db.get(Submission, ev.submission_id)
    assessment: Assessment = db.get(Assessment, submission.assessment_id)
    scenario: StudentScenario | None = db.get(StudentScenario, submission.scenario_id) if submission.scenario_id else None
    rubric = [
        {"key": c.key, "name": c.name, "max_marks": c.max_marks}
        for c in db.scalars(
            select(RubricCriterion).where(RubricCriterion.assessment_id == assessment.id).order_by(RubricCriterion.order_index)
        ).all()
    ]
    rubric_max = sum(c["max_marks"] for c in rubric) or 100

    try:
        _advance(db, ev, EvaluationStage.EXTRACTING)
        contents = submission_service.load_file_contents(db, submission)
        inventory = list(contents.keys())

        _advance(db, ev, EvaluationStage.FILE_ANALYSIS)
        expected_files = assessment.question.expected_files if assessment.question else []
        is_sql = any(p.lower().endswith(".sql") for p in inventory)

        _advance(db, ev, EvaluationStage.SYNTAX_CHECK)
        if is_sql:
            det_checks = code_analysis_service.analyse_sql_submission(
                files={p.split("/")[-1]: c for p, c in contents.items()},
                required_files=expected_files,
                expected_min_tables=max(2, len((scenario.scenario_variables or {}).get("entities", [])) or 3),
            )
        else:
            det_checks = code_analysis_service.analyse_generic_submission(
                files={p.split("/")[-1]: c for p, c in contents.items()}, required_files=expected_files
            )

        _advance(db, ev, EvaluationStage.TEST_CASES)
        for c in ev.test_cases:
            db.delete(c)
        db.flush()
        det_dicts = [c.dict() for c in det_checks]
        for c in det_dicts:
            db.add(AITestCase(evaluation_id=ev.id, **c))
        db.flush()

        _advance(db, ev, EvaluationStage.LOGIC_ANALYSIS)
        _advance(db, ev, EvaluationStage.RUBRIC_ANALYSIS)
        # One LLM call: rubric scoring, narrative feedback AND the AI-content
        # estimate together — halves the round-trips and keeps us inside the
        # provider's per-minute token budget.
        ai_eval = evaluate_answer(
            common_prompt=assessment.question.common_prompt if assessment.question else "",
            scenario_text=scenario.scenario_text if scenario else "",
            rubric=rubric,
            file_inventory=inventory,
            file_contents=contents,
            deterministic_results=det_dicts,
        )

        _advance(db, ev, EvaluationStage.AI_CONTENT_ANALYSIS)
        aic = _AIContent(
            estimated_probability=ai_eval.ai_content_probability,
            classification=ai_eval.ai_content_classification,
            confidence=ai_eval.confidence,
            evidence=ai_eval.ai_content_evidence,
        )

        _advance(db, ev, EvaluationStage.SCORING)
        rubric_scores = [s.model_dump() for s in ai_eval.rubric_scores]
        # server-side validation: no criterion over its max, total not over rubric max
        for rs in rubric_scores:
            rs["score"] = max(0.0, min(rs["score"], rs["max_score"]))
        overall = round(sum(rs["score"] for rs in rubric_scores), 1)
        overall = max(0.0, min(overall, float(rubric_max)))

        _advance(db, ev, EvaluationStage.REPORT_GENERATION)
        ev.overall_score = overall
        ev.max_score = float(rubric_max)
        ev.confidence = float(ai_eval.confidence)
        ev.rubric_scores = rubric_scores
        ev.strengths = ai_eval.strengths
        ev.weaknesses = ai_eval.weaknesses
        ev.recommendations = ai_eval.recommendations
        ev.explanation = ai_eval.explanation
        ev.ai_content_probability = round(aic.estimated_probability, 4)
        ev.ai_content_classification = aic.classification
        ev.ai_content_confidence = round(aic.confidence, 4)
        ev.ai_content_evidence = aic.evidence
        ev.prompt_version = EVAL_VERSION
        ev.completed_at = datetime.now(UTC)
        _advance(db, ev, EvaluationStage.COMPLETED)

        audit_service.record(
            db, action=AuditAction.AI_EVALUATION_COMPLETED, user_id=ev.started_by,
            entity_type="ai_evaluation", entity_id=ev.id,
            metadata={"score": overall, "ai_content_probability": ev.ai_content_probability},
        )
        for link in assessment.evaluator_links:
            notification_service.notify(
                db, user_id=link.evaluator_id, title="AI evaluation completed",
                message=f"AI evaluation finished with a score of {overall:.0f}/{rubric_max:.0f}.",
                ntype="AI_EVALUATION_COMPLETED", entity_type="ai_evaluation", entity_id=ev.id,
            )
    except Exception as e:
        ev.stage = EvaluationStage.FAILED
        ev.error = str(e)[:2000]
        db.flush()
        raise
    return ev


def get_evaluation(db: Session, evaluation_id: uuid.UUID, evaluator_id: uuid.UUID) -> AIEvaluation:
    ev = db.scalars(
        select(AIEvaluation).where(AIEvaluation.id == evaluation_id).options(selectinload(AIEvaluation.test_cases))
    ).first()
    if ev is None:
        raise not_found("EVALUATION_NOT_FOUND", "Evaluation does not exist.")
    submission = db.get(Submission, ev.submission_id)
    if not evaluator_can_access(db, evaluator_id, submission.assessment_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this assessment.")
    return ev


def publish_evaluation(db: Session, *, evaluation_id: uuid.UUID, evaluator_id: uuid.UUID) -> AIEvaluation:
    """Transactional: validate -> publish -> audit -> notify. Caller commits."""
    ev = db.scalars(
        select(AIEvaluation).where(AIEvaluation.id == evaluation_id).with_for_update() if not settings.is_sqlite
        else select(AIEvaluation).where(AIEvaluation.id == evaluation_id)
    ).first()
    if ev is None:
        raise not_found("EVALUATION_NOT_FOUND", "Evaluation does not exist.")
    submission = db.get(Submission, ev.submission_id)
    if not evaluator_can_access(db, evaluator_id, submission.assessment_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this assessment.")
    if ev.stage not in (EvaluationStage.COMPLETED, EvaluationStage.PUBLISHED):
        raise conflict("NOT_COMPLETED", "The AI evaluation has not completed yet.")
    if ev.published:
        raise conflict("ALREADY_PUBLISHED", "This evaluation is already published.")

    # Only the latest completed version can be published.
    latest = db.scalars(
        select(AIEvaluation).where(AIEvaluation.submission_id == submission.id).order_by(AIEvaluation.version.desc())
    ).first()
    if latest and latest.id != ev.id and latest.stage in _ACTIVE:
        raise conflict("NEWER_EVALUATION_RUNNING", "A newer evaluation version is still running.")

    ev.published = True
    ev.stage = EvaluationStage.PUBLISHED
    ev.published_at = datetime.now(UTC)
    ev.published_by = evaluator_id
    db.flush()

    audit_service.record(
        db, action=AuditAction.RESULT_PUBLISHED, user_id=evaluator_id,
        entity_type="ai_evaluation", entity_id=ev.id, metadata={"submission_id": str(submission.id)},
    )
    notification_service.notify(
        db, user_id=submission.student_id, title="Your evaluation has been published",
        message="Your assessment AI evaluation is now available under Results.",
        ntype="RESULT_PUBLISHED", entity_type="submission", entity_id=submission.id,
    )
    return ev
