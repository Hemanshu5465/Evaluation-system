from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.project_evaluator import PROMPT_VERSION, evaluate_project
from app.ai.provider import get_eval_provider
from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.storage import get_storage
from app.models.enums import AuditAction, EvaluationStage
from app.models.project import Project, ProjectEvaluation, ProjectSubmission
from app.services import audit_service, notification_service
from app.services.project_service import evaluator_can_access
from app.services.zip_service import decode_text, safe_extract

_PROJECT_STAGES = [
    EvaluationStage.QUEUED, EvaluationStage.EXTRACTING, EvaluationStage.FILE_ANALYSIS,
    EvaluationStage.LOGIC_ANALYSIS, EvaluationStage.RUBRIC_ANALYSIS,
    EvaluationStage.AI_CONTENT_ANALYSIS, EvaluationStage.SCORING,
    EvaluationStage.REPORT_GENERATION, EvaluationStage.COMPLETED,
]
_ACTIVE = set(_PROJECT_STAGES[:-1])


@dataclass
class _AIContent:
    estimated_probability: float
    classification: str
    confidence: float
    evidence: list[str] = field(default_factory=list)

_DEFAULT_RUBRIC = [
    {"key": "documentation", "name": "Documentation", "max_marks": 20},
    {"key": "architecture", "name": "Architecture", "max_marks": 20},
    {"key": "code_quality", "name": "Code Quality", "max_marks": 20},
    {"key": "database", "name": "Database", "max_marks": 20},
    {"key": "functionality", "name": "Functionality", "max_marks": 20},
]


def start_project_evaluation(
    db: Session, *, submission: ProjectSubmission, evaluator_id: uuid.UUID, force_new_version: bool = False
) -> ProjectEvaluation:
    if submission.status != "SUBMITTED":
        raise bad_request("NOT_SUBMITTED", "The student has not submitted this project yet.")
    if not evaluator_can_access(db, submission.project_id, evaluator_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this project.")

    latest = db.scalars(
        select(ProjectEvaluation)
        .where(ProjectEvaluation.submission_id == submission.id)
        .order_by(ProjectEvaluation.version.desc())
    ).first()
    if latest and not force_new_version:
        if latest.stage in _ACTIVE:
            raise conflict("EVALUATION_IN_PROGRESS", "A project evaluation is already running.")
        if latest.stage in (EvaluationStage.COMPLETED, EvaluationStage.PUBLISHED):
            return latest

    version = (latest.version + 1) if latest else 1
    ev = ProjectEvaluation(
        submission_id=submission.id,
        version=version,
        stage=EvaluationStage.QUEUED,
        stage_history=[{"stage": EvaluationStage.QUEUED, "at": datetime.now(UTC).isoformat()}],
        provider=get_eval_provider().name,
        prompt_version=PROMPT_VERSION,
    )
    db.add(ev)
    db.flush()
    return ev


def _advance(db: Session, ev: ProjectEvaluation, stage: EvaluationStage) -> None:
    ev.stage = stage
    idx = _PROJECT_STAGES.index(stage) if stage in _PROJECT_STAGES else len(_PROJECT_STAGES)
    ev.progress = min(100, round(idx / (len(_PROJECT_STAGES) - 1) * 100))
    ev.stage_history = [*ev.stage_history, {"stage": stage, "at": datetime.now(UTC).isoformat()}]
    db.flush()


def run_pipeline(db: Session, evaluation_id: uuid.UUID) -> ProjectEvaluation:
    ev = db.get(ProjectEvaluation, evaluation_id)
    if ev is None:
        raise not_found("EVALUATION_NOT_FOUND", "Evaluation does not exist.")
    submission = db.get(ProjectSubmission, ev.submission_id)
    project: Project = db.get(Project, submission.project_id)
    rubric = project.rubric or _DEFAULT_RUBRIC
    rubric_max = sum(c["max_marks"] for c in rubric) or 100

    try:
        _advance(db, ev, EvaluationStage.EXTRACTING)
        data = get_storage().load(submission.storage_key)
        extraction = safe_extract(data)
        inventory = [f.path for f in extraction.files]
        text_files = {f.path: decode_text(f) for f in extraction.files if f.is_text}

        _advance(db, ev, EvaluationStage.FILE_ANALYSIS)
        readme = next((c for p, c in text_files.items() if p.lower().endswith("readme.md")), "")
        docs = next((c for p, c in text_files.items() if "doc" in p.lower() and p.lower().endswith(".md")), "")
        db_script = "\n".join(c for p, c in text_files.items() if p.lower().endswith(".sql"))
        source = {p: c for p, c in text_files.items() if p.lower().endswith((".py", ".js", ".ts", ".java", ".go"))}

        _advance(db, ev, EvaluationStage.LOGIC_ANALYSIS)
        _advance(db, ev, EvaluationStage.RUBRIC_ANALYSIS)
        result = evaluate_project(
            brief=project.brief, rubric=rubric, inventory=inventory,
            readme_text=readme, doc_text=docs, db_script=db_script,
            source_excerpts=dict(list(source.items())[:8]),
        )

        _advance(db, ev, EvaluationStage.AI_CONTENT_ANALYSIS)
        aic = _AIContent(
            estimated_probability=result.ai_content_probability,
            classification=result.ai_content_classification,
            confidence=result.confidence,
            evidence=result.ai_content_evidence,
        )

        _advance(db, ev, EvaluationStage.SCORING)
        rubric_scores = [s.model_dump() for s in result.rubric_scores]
        for rs in rubric_scores:
            rs["score"] = max(0.0, min(rs["score"], rs["max_score"]))
        overall = max(0.0, min(round(sum(rs["score"] for rs in rubric_scores), 1), float(rubric_max)))

        _advance(db, ev, EvaluationStage.REPORT_GENERATION)
        ev.overall_score = overall
        ev.max_score = float(rubric_max)
        ev.confidence = float(result.confidence)
        ev.rubric_scores = rubric_scores
        ev.checks = [c.model_dump() for c in result.checks]
        ev.strengths = result.strengths
        ev.weaknesses = result.weaknesses
        ev.recommendations = result.recommendations
        ev.explanation = result.explanation
        ev.ai_content_probability = round(aic.estimated_probability, 4)
        ev.ai_content_classification = aic.classification
        ev.ai_content_confidence = round(aic.confidence, 4)
        ev.completed_at = datetime.now(UTC)
        _advance(db, ev, EvaluationStage.COMPLETED)
    except Exception as e:
        ev.stage = EvaluationStage.FAILED
        ev.error = str(e)[:2000]
        db.flush()
        raise
    return ev


def get_evaluation(db: Session, evaluation_id: uuid.UUID, evaluator_id: uuid.UUID) -> ProjectEvaluation:
    ev = db.get(ProjectEvaluation, evaluation_id)
    if ev is None:
        raise not_found("EVALUATION_NOT_FOUND", "Evaluation does not exist.")
    submission = db.get(ProjectSubmission, ev.submission_id)
    if not evaluator_can_access(db, submission.project_id, evaluator_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this project.")
    return ev


def publish_evaluation(db: Session, *, evaluation_id: uuid.UUID, evaluator_id: uuid.UUID) -> ProjectEvaluation:
    ev = db.get(ProjectEvaluation, evaluation_id)
    if ev is None:
        raise not_found("EVALUATION_NOT_FOUND", "Evaluation does not exist.")
    submission = db.get(ProjectSubmission, ev.submission_id)
    if not evaluator_can_access(db, submission.project_id, evaluator_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this project.")
    if ev.stage not in (EvaluationStage.COMPLETED, EvaluationStage.PUBLISHED):
        raise conflict("NOT_COMPLETED", "The project evaluation has not completed yet.")
    if ev.published:
        raise conflict("ALREADY_PUBLISHED", "This evaluation is already published.")

    ev.published = True
    ev.stage = EvaluationStage.PUBLISHED
    ev.published_at = datetime.now(UTC)
    ev.published_by = evaluator_id
    db.flush()
    audit_service.record(
        db, action=AuditAction.PROJECT_RESULT_PUBLISHED, user_id=evaluator_id,
        entity_type="project_evaluation", entity_id=ev.id,
    )
    notification_service.notify(
        db, user_id=submission.student_id, title="Your project evaluation is available",
        message="Your project AI evaluation has been published to Results.",
        ntype="PROJECT_RESULT_PUBLISHED", entity_type="project_submission", entity_id=submission.id,
    )
    return ev


def student_project_result(db: Session, *, submission_id: uuid.UUID, student_id: uuid.UUID) -> dict:
    submission = db.get(ProjectSubmission, submission_id)
    if submission is None:
        raise not_found("PROJECT_SUBMISSION_NOT_FOUND", "Project submission does not exist.")
    if submission.student_id != student_id:
        raise forbidden("NOT_OWNER", "This submission is not yours.")
    ev = db.scalars(
        select(ProjectEvaluation)
        .where(ProjectEvaluation.submission_id == submission.id, ProjectEvaluation.published.is_(True))
        .order_by(ProjectEvaluation.version.desc())
    ).first()
    if ev is None:
        raise conflict("RESULT_NOT_PUBLISHED", "Your project result has not been published yet.")
    from app.services.result_service import AI_CONTENT_DISCLAIMER

    return {
        "submission_id": str(submission.id),
        "project_id": str(submission.project_id),
        "status": "PUBLISHED",
        "ai_score": ev.overall_score,
        "max_score": ev.max_score,
        "confidence": ev.confidence,
        "rubric_scores": ev.rubric_scores,
        "checks": ev.checks,
        "checks_passed": sum(1 for c in ev.checks if c.get("passed")),
        "checks_failed": sum(1 for c in ev.checks if not c.get("passed")),
        "strengths": ev.strengths,
        "weaknesses": ev.weaknesses,
        "recommendations": ev.recommendations,
        "explanation": ev.explanation,
        "ai_content": {
            "estimated_probability": ev.ai_content_probability,
            "classification": ev.ai_content_classification,
            "confidence": ev.ai_content_confidence,
            "disclaimer": AI_CONTENT_DISCLAIMER,
        },
    }
