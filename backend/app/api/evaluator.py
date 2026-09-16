from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import db_session, require_evaluator
from app.core.errors import forbidden, not_found
from app.core.pagination import Page, PageParams, page_params, paginate
from app.models.academic import Assessment, AssessmentEvaluator, Subject
from app.models.enums import ManualEvaluationStatus
from app.models.project import ProjectEvaluator, ProjectSubmission
from app.models.submission import AIEvaluation, ManualEvaluation, Submission
from app.models.user import User
from app.schemas import (
    AIEvaluationOut,
    AITestCaseOut,
    AssessmentOut,
    ManualEvaluationOut,
    ManualEvaluationRequest,
    ProjectEvaluationOut,
    ProjectSubmissionOut,
    StartEvaluationResponse,
    SubmissionOut,
)
from app.api._serializers import project_submission_out, submission_out
from app.services import ai_evaluation_service, manual_evaluation_service, project_service
from app.services import project_evaluation_service, submission_service
from app.services.submission_service import get_for_evaluator
from app.workers.dispatch import dispatch_ai_evaluation, dispatch_project_evaluation

router = APIRouter(prefix="/evaluator", tags=["Evaluator"], dependencies=[Depends(require_evaluator)])


def _assigned_assessment_ids(db: Session, evaluator_id: uuid.UUID) -> list[uuid.UUID]:
    return [
        r for r in db.scalars(
            select(AssessmentEvaluator.assessment_id).where(AssessmentEvaluator.evaluator_id == evaluator_id)
        ).all()
    ]


@router.get("/dashboard")
def dashboard(db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    aids = _assigned_assessment_ids(db, user.id)
    subs = db.scalars(
        select(Submission).where(Submission.assessment_id.in_(aids)).options(
            selectinload(Submission.ai_evaluations), selectinload(Submission.manual_evaluation)
        )
    ).all() if aids else []
    pending = sum(1 for s in subs if s.status == "SUBMITTED" and not s.ai_evaluations)
    ai_done = sum(1 for s in subs if any(e.stage in ("COMPLETED", "PUBLISHED") for e in s.ai_evaluations))
    manual_done = sum(1 for s in subs if s.manual_evaluation and s.manual_evaluation.status == "COMPLETED")
    published = sum(1 for s in subs if any(e.published for e in s.ai_evaluations))
    scores = [max((e.overall_score for e in s.ai_evaluations), default=0) for s in subs if s.ai_evaluations]
    return {
        "assigned_assessments": len(aids),
        "pending_reviews": pending,
        "ai_evaluations": ai_done,
        "manual_reviews": manual_done,
        "published_results": published,
        "average_score": round(sum(scores) / len(scores), 1) if scores else 0,
    }


@router.get("/analytics")
def analytics(db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    aids = _assigned_assessment_ids(db, user.id)
    subs = db.scalars(
        select(Submission).where(Submission.assessment_id.in_(aids)).options(selectinload(Submission.ai_evaluations))
    ).all() if aids else []
    published = sum(1 for s in subs if any(e.published for e in s.ai_evaluations))
    pending = sum(1 for s in subs if s.status == "SUBMITTED" and not any(e.published for e in s.ai_evaluations))
    return {"total": len(subs), "published": published, "pending": pending}


@router.get("/submissions", response_model=Page[SubmissionOut])
def list_submissions(
    db: Session = Depends(db_session),
    user: User = Depends(require_evaluator),
    params: PageParams = Depends(page_params),
    search: str | None = Query(None),
    subject_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    sort: str = Query("created_at"),
):
    aids = _assigned_assessment_ids(db, user.id)
    if not aids:
        return Page(items=[], page=params.page, page_size=params.page_size, total=0, total_pages=1)

    stmt = (
        select(Submission)
        .where(Submission.assessment_id.in_(aids))
        .options(selectinload(Submission.files))
    )
    if subject_id:
        stmt = stmt.join(Assessment, Assessment.id == Submission.assessment_id).where(Assessment.subject_id == subject_id)
    if status_filter:
        stmt = stmt.where(Submission.status == status_filter)
    if search:
        like = f"%{search.lower()}%"
        stmt = stmt.join(User, User.id == Submission.student_id).where(
            (User.name.ilike(like)) | (User.student_id.ilike(like))
        )
    order_col = {
        "created_at": Submission.created_at,
        "submitted_at": Submission.submitted_at,
        "status": Submission.status,
    }.get(sort, Submission.created_at)
    stmt = stmt.order_by(order_col.desc())

    rows, total, total_pages = paginate(db, stmt, params)
    return Page(
        items=[submission_out(db, r, include_manual=True) for r in rows],
        page=params.page, page_size=params.page_size, total=total, total_pages=total_pages,
    )


@router.get("/submissions/{submission_id}", response_model=SubmissionOut)
def get_submission(submission_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    return submission_out(db, get_for_evaluator(db, submission_id, user.id), include_manual=True)


@router.get("/assessments/{assessment_id}", response_model=AssessmentOut)
def get_assessment(assessment_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    from app.api._serializers import assessment_out
    from app.services.assessment_service import evaluator_can_access, get_assessment as _get

    if not evaluator_can_access(db, user.id, assessment_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this assessment.")
    return assessment_out(db, _get(db, assessment_id))


@router.get("/submissions/{submission_id}/file")
def submission_file(
    submission_id: uuid.UUID,
    path: str,
    db: Session = Depends(db_session),
    user: User = Depends(require_evaluator),
):
    sub = get_for_evaluator(db, submission_id, user.id)
    return submission_service.load_one_file(db, sub, path)


@router.get("/submissions/{submission_id}/test-cases", response_model=list[AITestCaseOut])
def submission_test_cases(submission_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    sub = get_for_evaluator(db, submission_id, user.id)
    latest = max(sub.ai_evaluations, key=lambda e: e.version, default=None)
    if latest is None:
        raise not_found("NO_EVALUATION", "No AI evaluation has been run for this submission.")
    ev = ai_evaluation_service.get_evaluation(db, latest.id, user.id)
    return [AITestCaseOut.model_validate(tc) for tc in sorted(ev.test_cases, key=lambda t: t.code)]


@router.post("/submissions/{submission_id}/ai-evaluate", response_model=StartEvaluationResponse, status_code=status.HTTP_202_ACCEPTED)
def start_ai_evaluation(
    submission_id: uuid.UUID,
    force_new_version: bool = Query(False),
    db: Session = Depends(db_session),
    user: User = Depends(require_evaluator),
):
    sub = get_for_evaluator(db, submission_id, user.id)
    ev = ai_evaluation_service.start_ai_evaluation(
        db, submission=sub, evaluator_id=user.id, force_new_version=force_new_version
    )
    db.flush()
    if ev.stage in ("COMPLETED", "PUBLISHED"):
        db.commit()
        return StartEvaluationResponse(evaluation_id=ev.id, job_id=None, status=ev.stage)
    job = dispatch_ai_evaluation(db, evaluation_id=ev.id, actor_id=user.id)
    return StartEvaluationResponse(evaluation_id=ev.id, job_id=job.id, status="QUEUED")


@router.get("/ai-evaluations/{evaluation_id}", response_model=AIEvaluationOut)
def get_ai_evaluation(evaluation_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    return AIEvaluationOut.model_validate(ai_evaluation_service.get_evaluation(db, evaluation_id, user.id))


@router.post("/ai-evaluations/{evaluation_id}/publish", response_model=AIEvaluationOut)
def publish_ai_evaluation(evaluation_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    ev = ai_evaluation_service.publish_evaluation(db, evaluation_id=evaluation_id, evaluator_id=user.id)
    db.commit()
    return AIEvaluationOut.model_validate(ai_evaluation_service.get_evaluation(db, ev.id, user.id))


# --------------------------------------------------------------------------- #
# Manual evaluation (private to evaluator)
# --------------------------------------------------------------------------- #
@router.post("/submissions/{submission_id}/manual-evaluation", response_model=ManualEvaluationOut)
def create_manual_evaluation(
    submission_id: uuid.UUID,
    body: ManualEvaluationRequest,
    db: Session = Depends(db_session),
    user: User = Depends(require_evaluator),
):
    sub = get_for_evaluator(db, submission_id, user.id)
    record = manual_evaluation_service.upsert_manual_evaluation(
        db,
        submission=sub,
        evaluator_id=user.id,
        scores=body.scores,
        comments=body.comments,
        strengths=body.strengths,
        improvements=body.improvements,
        status=ManualEvaluationStatus(body.status),
    )
    db.commit()
    return ManualEvaluationOut.model_validate(record)


@router.put("/manual-evaluations/{manual_id}", response_model=ManualEvaluationOut)
def update_manual_evaluation(
    manual_id: uuid.UUID,
    body: ManualEvaluationRequest,
    db: Session = Depends(db_session),
    user: User = Depends(require_evaluator),
):
    record = manual_evaluation_service.get_manual_evaluation(db, manual_id, user.id)
    sub = get_for_evaluator(db, record.submission_id, user.id)
    record = manual_evaluation_service.upsert_manual_evaluation(
        db, submission=sub, evaluator_id=user.id, scores=body.scores, comments=body.comments,
        strengths=body.strengths, improvements=body.improvements, status=ManualEvaluationStatus(body.status),
    )
    db.commit()
    return ManualEvaluationOut.model_validate(record)


@router.get("/manual-evaluations/{manual_id}", response_model=ManualEvaluationOut)
def get_manual_evaluation(manual_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    return ManualEvaluationOut.model_validate(manual_evaluation_service.get_manual_evaluation(db, manual_id, user.id))


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
@router.get("/projects/submissions", response_model=list[ProjectSubmissionOut])
def list_project_submissions(db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    pids = [r for r in db.scalars(
        select(ProjectEvaluator.project_id).where(ProjectEvaluator.evaluator_id == user.id)
    ).all()]
    if not pids:
        return []
    stmt = select(ProjectSubmission).where(ProjectSubmission.project_id.in_(pids)).order_by(ProjectSubmission.created_at.desc())
    return [project_submission_out(db, s) for s in db.scalars(stmt).all()]


@router.get("/projects/submissions/{submission_id}", response_model=ProjectSubmissionOut)
def get_project_submission(submission_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    return project_submission_out(db, project_service.get_submission_for_evaluator(db, submission_id, user.id))


@router.post("/projects/submissions/{submission_id}/ai-evaluate", response_model=StartEvaluationResponse, status_code=status.HTTP_202_ACCEPTED)
def start_project_evaluation(
    submission_id: uuid.UUID,
    force_new_version: bool = Query(False),
    db: Session = Depends(db_session),
    user: User = Depends(require_evaluator),
):
    sub = project_service.get_submission_for_evaluator(db, submission_id, user.id)
    ev = project_evaluation_service.start_project_evaluation(
        db, submission=sub, evaluator_id=user.id, force_new_version=force_new_version
    )
    db.flush()
    if ev.stage in ("COMPLETED", "PUBLISHED"):
        db.commit()
        return StartEvaluationResponse(evaluation_id=ev.id, job_id=None, status=ev.stage)
    job = dispatch_project_evaluation(db, evaluation_id=ev.id, actor_id=user.id)
    return StartEvaluationResponse(evaluation_id=ev.id, job_id=job.id, status="QUEUED")


@router.get("/projects/evaluations/{evaluation_id}", response_model=ProjectEvaluationOut)
def get_project_evaluation(evaluation_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    return ProjectEvaluationOut.model_validate(project_evaluation_service.get_evaluation(db, evaluation_id, user.id))


@router.post("/projects/evaluations/{evaluation_id}/publish", response_model=ProjectEvaluationOut)
def publish_project_evaluation(evaluation_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_evaluator)):
    ev = project_evaluation_service.publish_evaluation(db, evaluation_id=evaluation_id, evaluator_id=user.id)
    db.commit()
    return ProjectEvaluationOut.model_validate(project_evaluation_service.get_evaluation(db, ev.id, user.id))
