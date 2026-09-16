from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import db_session, require_student
from app.core.errors import bad_request, forbidden, not_found
from app.models.academic import Assessment
from app.models.enums import AssessmentStatus
from app.models.submission import Submission
from app.models.user import User
from app.schemas import (
    AssessmentOut,
    ProjectEvaluationOut,
    ProjectOut,
    ProjectSubmissionOut,
    ScenarioOut,
    SubmissionOut,
)
from app.api._serializers import assessment_out, project_submission_out, submission_out
from app.services import assessment_service, project_service, result_service, scenario_service, submission_service
from app.services import project_evaluation_service

router = APIRouter(prefix="/student", tags=["Student"], dependencies=[Depends(require_student)])


@router.get("/dashboard")
def dashboard(db: Session = Depends(db_session), user: User = Depends(require_student)):
    assessments = assessment_service.student_assessments(db, user.id)
    subs = db.scalars(select(Submission).where(Submission.student_id == user.id)).all()
    projects = project_service.list_projects_for_student(db, user.id)
    published_results = sum(1 for s in subs if any(e.published for e in s.ai_evaluations))
    return {
        "active_assessments": sum(1 for a in assessments if not any(
            sb.assessment_id == a.id and any(e.published for e in sb.ai_evaluations) for sb in subs
        )),
        "total_assessments": len(assessments),
        "projects": len(projects),
        "published_results": published_results,
        "assessments": [
            {"id": str(a.id), "title": a.title, "status": a.status,
             "deadline": a.deadline.isoformat() if a.deadline else None}
            for a in assessments
        ],
    }


@router.get("/assessments", response_model=list[AssessmentOut])
def list_assessments(db: Session = Depends(db_session), user: User = Depends(require_student)):
    return [assessment_out(db, a) for a in assessment_service.student_assessments(db, user.id)]


@router.get("/assessments/{assessment_id}", response_model=AssessmentOut)
def get_assessment(assessment_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    if not assessment_service.student_assigned(db, user.id, assessment_id):
        raise forbidden("NOT_ASSIGNED", "This assessment is not assigned to you.")
    a = assessment_service.get_assessment(db, assessment_id)
    if a.status != AssessmentStatus.PUBLISHED:
        raise forbidden("NOT_PUBLISHED", "This assessment is not published.")
    out = assessment_out(db, a)
    timing = assessment_service.time_status(db, a, user.id)
    out.started_at = timing["started_at"]
    out.expires_at = timing["expires_at"]
    return out


@router.post("/assessments/{assessment_id}/start", response_model=AssessmentOut)
def start_assessment(assessment_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    """Called when the student opens the question. Starts this student's personal
    countdown the first time (if the assessment has a time limit) — safe to call
    again on every visit, it never resets an already-running clock."""
    if not assessment_service.student_assigned(db, user.id, assessment_id):
        raise forbidden("NOT_ASSIGNED", "This assessment is not assigned to you.")
    a = assessment_service.get_assessment(db, assessment_id)
    if a.status != AssessmentStatus.PUBLISHED:
        raise forbidden("NOT_PUBLISHED", "This assessment is not published.")
    assessment_service.start_attempt(db, assessment_id=assessment_id, student_id=user.id)
    db.commit()
    a = assessment_service.get_assessment(db, assessment_id)
    out = assessment_out(db, a)
    timing = assessment_service.time_status(db, a, user.id)
    out.started_at = timing["started_at"]
    out.expires_at = timing["expires_at"]
    return out


@router.get("/assessments/{assessment_id}/scenario", response_model=ScenarioOut)
def get_scenario(
    assessment_id: uuid.UUID,
    wait: bool = True,
    db: Session = Depends(db_session),
    user: User = Depends(require_student),
):
    """`wait=true` (default) generates the scenario on demand if the background job
    hasn't reached this student yet (blocks ~5s). `wait=false` returns 404 quickly."""
    if not assessment_service.student_assigned(db, user.id, assessment_id):
        raise forbidden("NOT_ASSIGNED", "This assessment is not assigned to you.")
    scenario = scenario_service.get_student_scenario(
        db, assessment_id=assessment_id, student_id=user.id, generate_if_missing=wait
    )
    scenario_service.assert_owns_scenario(scenario, user.id)  # defence in depth
    return ScenarioOut.model_validate(scenario)


@router.post("/assessments/{assessment_id}/submissions", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def upload_submission(
    assessment_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(db_session),
    user: User = Depends(require_student),
):
    assessment = assessment_service.get_assessment(db, assessment_id)
    data = await file.read()
    submission = submission_service.create_submission(
        db, assessment=assessment, student_id=user.id, data=data, filename=file.filename or "submission.zip"
    )
    db.commit()
    return submission_out(db, submission_service.get_for_student(db, submission.id, user.id))


@router.post("/submissions/{submission_id}/submit", response_model=SubmissionOut)
def submit_submission(submission_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    submission = submission_service.get_for_student(db, submission_id, user.id)
    submission_service.submit(db, submission=submission, student_id=user.id)
    db.commit()
    return submission_out(db, submission_service.get_for_student(db, submission_id, user.id))


@router.get("/submissions", response_model=list[SubmissionOut])
def list_submissions(db: Session = Depends(db_session), user: User = Depends(require_student)):
    stmt = (
        select(Submission)
        .where(Submission.student_id == user.id)
        .options(selectinload(Submission.files))
        .order_by(Submission.created_at.desc())
    )
    return [submission_out(db, s) for s in db.scalars(stmt).all()]


@router.get("/submissions/{submission_id}", response_model=SubmissionOut)
def get_submission(submission_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    return submission_out(db, submission_service.get_for_student(db, submission_id, user.id))


@router.get("/submissions/{submission_id}/result")
def get_result(submission_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    # Returns ONLY published AI data. Evaluator private marks are never included.
    return result_service.student_result(db, submission_id=submission_id, student_id=user.id)


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(db_session), user: User = Depends(require_student)):
    return [ProjectOut.model_validate(p) for p in project_service.list_projects_for_student(db, user.id)]


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    if not project_service.student_can_access(db, project_id, user.id):
        raise forbidden("NOT_ASSIGNED", "This project is not assigned to you.")
    return ProjectOut.model_validate(project_service.get_project(db, project_id))


@router.post("/projects/{project_id}/submissions", response_model=ProjectSubmissionOut, status_code=status.HTTP_201_CREATED)
async def upload_project(
    project_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(db_session),
    user: User = Depends(require_student),
):
    project = project_service.get_project(db, project_id)
    data = await file.read()
    sub = project_service.create_project_submission(
        db, project=project, student_id=user.id, data=data, filename=file.filename or "project.zip"
    )
    db.commit()
    return project_submission_out(db, project_service.get_submission_for_student(db, sub.id, user.id))


@router.post("/project-submissions/{submission_id}/submit", response_model=ProjectSubmissionOut)
def submit_project(submission_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    sub = project_service.get_submission_for_student(db, submission_id, user.id)
    project_service.submit_project(db, submission=sub, student_id=user.id)
    db.commit()
    return project_submission_out(db, project_service.get_submission_for_student(db, submission_id, user.id))


@router.get("/projects/{project_id}/submissions", response_model=list[ProjectSubmissionOut])
def list_project_submissions(project_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    from app.models.project import ProjectSubmission

    if not project_service.student_can_access(db, project_id, user.id):
        raise forbidden("NOT_ASSIGNED", "This project is not assigned to you.")
    stmt = (
        select(ProjectSubmission)
        .where(ProjectSubmission.project_id == project_id, ProjectSubmission.student_id == user.id)
        .order_by(ProjectSubmission.created_at.desc())
    )
    return [project_submission_out(db, s) for s in db.scalars(stmt).all()]


@router.get("/project-submissions/{submission_id}/result")
def project_result(submission_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_student)):
    return project_evaluation_service.student_project_result(db, submission_id=submission_id, student_id=user.id)
