from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.deps import db_session, require_admin
from app.core.errors import bad_request, conflict, not_found
from app.core.security import generate_password, hash_password
from app.models.academic import Assessment, Question, Subject
from app.models.enums import AssessmentStatus, Role
from app.models.submission import AIEvaluation, ManualEvaluation, Submission
from app.models.system import AuditLog
from app.models.user import User
from app.schemas import (
    AssessmentOut,
    AssignRequest,
    CreateEvaluatorRequest,
    CreateEvaluatorResponse,
    GenerateAssessmentRequest,
    JobOut,
    PublishAssessmentRequest,
    ProjectCreate,
    ProjectOut,
    SubjectCreate,
    SubjectOut,
    SubjectUpdate,
    SyllabusAnalysisOut,
    SyllabusOut,
    UserOut,
)
from app.api._serializers import assessment_out
from app.schemas import ScenarioWithStudentOut
from app.models.academic import StudentScenario
from app.services import assessment_service, subject_service
from app.services.document_extraction import ALLOWED_SYLLABUS_EXT
from app.services.syllabus_service import analyze_and_create_subject as subject_service_analyze
from app.services.syllabus_service import upload_syllabus
from app.workers.dispatch import (
    dispatch_question_generation,
    dispatch_scenario_generation,
    dispatch_syllabus_processing,
)

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


# --------------------------------------------------------------------------- #
# Dashboard / analytics
# --------------------------------------------------------------------------- #
@router.get("/dashboard")
def dashboard(db: Session = Depends(db_session)):
    students = db.scalar(select(func.count()).select_from(User).where(User.role == Role.STUDENT)) or 0
    evaluators = db.scalar(select(func.count()).select_from(User).where(User.role == Role.EVALUATOR)) or 0
    active_subjects = db.scalar(select(func.count()).select_from(Subject).where(Subject.is_active.is_(True))) or 0
    active_questions = db.scalar(
        select(func.count()).select_from(Assessment).where(Assessment.status == AssessmentStatus.PUBLISHED)
    ) or 0
    subs = db.scalars(select(Submission)).all()
    pending = sum(1 for s in subs if s.status == "SUBMITTED" and not any(e.published for e in s.ai_evaluations))
    completed = sum(1 for s in subs if any(e.published for e in s.ai_evaluations))
    return {
        "total_students": students,
        "total_evaluators": evaluators,
        "active_subjects": active_subjects,
        "active_questions": active_questions,
        "pending_evaluations": pending,
        "completed_evaluations": completed,
        "recent_activity": [
            {"action": a.action, "entity_type": a.entity_type, "at": a.created_at.isoformat()}
            for a in db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(12)).all()
        ],
    }


@router.get("/analytics/overview")
def analytics_overview(db: Session = Depends(db_session)):
    ai = db.scalars(select(AIEvaluation).where(AIEvaluation.stage.in_(["COMPLETED", "PUBLISHED"]))).all()
    manual = db.scalars(select(ManualEvaluation).where(ManualEvaluation.status == "COMPLETED")).all()
    avg_ai = round(sum(e.overall_score for e in ai) / len(ai), 1) if ai else 0
    avg_manual = round(sum(m.total for m in manual) / len(manual), 1) if manual else 0
    by_subject: dict[str, list[float]] = {}
    for e in ai:
        sub = db.get(Submission, e.submission_id)
        a = db.get(Assessment, sub.assessment_id)
        s = db.get(Subject, a.subject_id)
        by_subject.setdefault(s.name, []).append(e.overall_score)
    return {
        "ai_evaluations_completed": len(ai),
        "manual_evaluations_completed": len(manual),
        "average_ai_score": avg_ai,
        "average_manual_score": avg_manual,
        "average_score_by_subject": {k: round(sum(v) / len(v), 1) for k, v in by_subject.items()},
    }


@router.get("/analytics/submissions")
def analytics_submissions(db: Session = Depends(db_session)):
    subs = db.scalars(select(Submission)).all()
    buckets: dict[str, int] = {}
    for s in subs:
        d = (s.submitted_at or s.created_at).date().isoformat()
        buckets[d] = buckets.get(d, 0) + 1
    return {"by_day": dict(sorted(buckets.items())), "total": len(subs)}


@router.get("/analytics/scores")
def analytics_scores(db: Session = Depends(db_session)):
    rows = []
    for e in db.scalars(select(AIEvaluation).where(AIEvaluation.stage.in_(["COMPLETED", "PUBLISHED"]))).all():
        sub = db.get(Submission, e.submission_id)
        m = db.scalar(select(ManualEvaluation).where(ManualEvaluation.submission_id == sub.id))
        rows.append({
            "submission_id": str(sub.id),
            "ai_score": e.overall_score,
            "manual_score": m.total if m and m.status == "COMPLETED" else None,
        })
    return {"rows": rows}


# --------------------------------------------------------------------------- #
# Subjects
# --------------------------------------------------------------------------- #
def _subject_out(s: Subject) -> SubjectOut:
    return SubjectOut.model_validate(s)


@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(db: Session = Depends(db_session)):
    stmt = select(Subject).options(selectinload(Subject.syllabus)).order_by(Subject.created_at)
    return [_subject_out(s) for s in db.scalars(stmt).all()]


@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(body: SubjectCreate, db: Session = Depends(db_session), user: User = Depends(require_admin)):
    s = subject_service.create_subject(
        db, name=body.name, code=body.code, semester=body.semester, description=body.description, created_by=user.id
    )
    db.commit()
    return _subject_out(s)


@router.get("/subjects/{subject_id}", response_model=SubjectOut)
def get_subject(subject_id: uuid.UUID, db: Session = Depends(db_session)):
    return _subject_out(subject_service.get_subject(db, subject_id))


@router.put("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(subject_id: uuid.UUID, body: SubjectUpdate, db: Session = Depends(db_session)):
    s = subject_service.update_subject(db, subject_id, **body.model_dump(exclude_none=True))
    db.commit()
    return _subject_out(s)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(subject_id: uuid.UUID, db: Session = Depends(db_session)):
    subject_service.delete_subject(db, subject_id)
    db.commit()


# --------------------------------------------------------------------------- #
# Syllabus
# --------------------------------------------------------------------------- #
@router.post("/subjects/{subject_id}/syllabus", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
async def upload_subject_syllabus(
    subject_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(db_session),
    user: User = Depends(require_admin),
):
    subject = subject_service.get_subject(db, subject_id)
    ext = "." + (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ALLOWED_SYLLABUS_EXT:
        raise bad_request("BAD_SYLLABUS_TYPE", "Syllabus must be PDF, DOCX or TXT.")
    data = await file.read()
    syllabus = upload_syllabus(
        db,
        subject=subject,
        data=data,
        filename=file.filename or "syllabus" + ext,
        content_type=file.content_type or "application/octet-stream",
        actor_id=user.id,
    )
    db.flush()
    job = dispatch_syllabus_processing(db, syllabus_id=syllabus.id, actor_id=user.id)
    return JobOut.model_validate(db.get(type(job), job.id))


@router.get("/subjects/{subject_id}/syllabus", response_model=SyllabusOut)
def get_syllabus(subject_id: uuid.UUID, db: Session = Depends(db_session)):
    subject = subject_service.get_subject(db, subject_id)
    if subject.syllabus is None:
        raise not_found("SYLLABUS_NOT_FOUND", "No syllabus uploaded for this subject.")
    return SyllabusOut.model_validate(subject.syllabus)


@router.delete("/subjects/{subject_id}/syllabus", status_code=status.HTTP_204_NO_CONTENT)
def delete_syllabus(subject_id: uuid.UUID, db: Session = Depends(db_session)):
    subject = subject_service.get_subject(db, subject_id)
    if subject.syllabus is not None:
        db.delete(subject.syllabus)
        db.commit()


# --------------------------------------------------------------------------- #
# Workspace — one upload does analyze + create subject + process syllabus
# --------------------------------------------------------------------------- #
@router.post("/workspace/syllabus", response_model=SyllabusAnalysisOut, status_code=status.HTTP_201_CREATED)
async def workspace_upload_syllabus(
    file: UploadFile = File(...),
    db: Session = Depends(db_session),
    user: User = Depends(require_admin),
):
    ext = "." + (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else ""
    if ext not in ALLOWED_SYLLABUS_EXT:
        raise bad_request("BAD_SYLLABUS_TYPE", "Syllabus must be PDF, DOCX or TXT.")
    data = await file.read()
    subject, analysis = subject_service_analyze(
        db, data=data, filename=file.filename or f"syllabus{ext}",
        content_type=file.content_type or "application/octet-stream", actor_id=user.id,
    )
    db.commit()
    return SyllabusAnalysisOut(
        subject_id=subject.id,
        subject_name=subject.name,
        subject_code=subject.code,
        semester=subject.semester,
        description=analysis.description,
        difficulty=analysis.difficulty,
        topics=analysis.topics,
        learning_outcomes=analysis.learning_outcomes,
    )


# --------------------------------------------------------------------------- #
# Assessments
# --------------------------------------------------------------------------- #
@router.post("/assessments/generate", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def generate_assessment(body: GenerateAssessmentRequest, db: Session = Depends(db_session), user: User = Depends(require_admin)):
    subject = subject_service.get_subject(db, body.subject_id)
    assessment = assessment_service.create_assessment(
        db,
        subject=subject,
        title=body.title or f"{subject.name} — Scenario-Based Assessment",
        difficulty=body.difficulty,
        deadline=body.deadline,
        actor_id=user.id,
    )
    db.flush()
    job = dispatch_question_generation(
        db,
        assessment_id=assessment.id,
        difficulty=body.difficulty,
        topics=body.topics,
        number_of_parts=body.number_of_parts,
        class_coverage=body.class_coverage,
        actor_id=user.id,
    )
    return JobOut.model_validate(db.get(type(job), job.id))


@router.get("/assessments", response_model=list[AssessmentOut])
def list_assessments(db: Session = Depends(db_session)):
    stmt = select(Assessment).options(
        selectinload(Assessment.question).selectinload(Question.parts),
        selectinload(Assessment.rubric_criteria),
    ).order_by(Assessment.created_at.desc())
    return [assessment_out(db, a) for a in db.scalars(stmt).all()]


@router.get("/assessments/{assessment_id}", response_model=AssessmentOut)
def get_assessment(assessment_id: uuid.UUID, db: Session = Depends(db_session)):
    return assessment_out(db, assessment_service.get_assessment(db, assessment_id))


@router.delete("/assessments/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(assessment_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_admin)):
    assessment_service.delete_assessment(db, assessment_id, actor_id=user.id)
    db.commit()


@router.get("/assessments/{assessment_id}/scenarios", response_model=list[ScenarioWithStudentOut])
def list_assessment_scenarios(assessment_id: uuid.UUID, db: Session = Depends(db_session)):
    assessment_service.get_assessment(db, assessment_id)  # 404 if missing
    scenarios = db.scalars(
        select(StudentScenario).where(StudentScenario.assessment_id == assessment_id).order_by(StudentScenario.scenario_code)
    ).all()
    out = []
    for sc in scenarios:
        student = db.get(User, sc.student_id)
        item = ScenarioWithStudentOut.model_validate(sc)
        item.student_name = student.name if student else None
        item.student_code = student.student_id if student else None
        out.append(item)
    return out


@router.put("/assessments/{assessment_id}", response_model=AssessmentOut)
def update_assessment(assessment_id: uuid.UUID, body: dict, db: Session = Depends(db_session)):
    a = assessment_service.get_assessment(db, assessment_id)
    if a.status == AssessmentStatus.PUBLISHED:
        raise bad_request("PUBLISHED_LOCKED", "A published assessment cannot be edited.")
    for field in ("title", "difficulty", "allow_resubmission"):
        if field in body and body[field] is not None:
            setattr(a, field, body[field])
    if a.question and "common_prompt" in body and body["common_prompt"]:
        a.question.common_prompt = body["common_prompt"]
    db.commit()
    return assessment_out(db, assessment_service.get_assessment(db, assessment_id))


@router.post("/assessments/{assessment_id}/assign", response_model=AssessmentOut)
def assign_assessment(assessment_id: uuid.UUID, body: AssignRequest, db: Session = Depends(db_session)):
    a = assessment_service.get_assessment(db, assessment_id)
    assessment_service.assign(db, a, evaluator_ids=body.evaluator_ids, student_ids=body.student_ids)
    db.commit()
    return assessment_out(db, assessment_service.get_assessment(db, assessment_id))


@router.post("/assessments/{assessment_id}/publish", response_model=AssessmentOut)
def publish_assessment(
    assessment_id: uuid.UUID,
    body: PublishAssessmentRequest | None = None,
    db: Session = Depends(db_session),
    user: User = Depends(require_admin),
):
    a = assessment_service.get_assessment(db, assessment_id)

    # publish "to all students" — assign every student (and every evaluator) automatically
    student_ids = [r for r in db.scalars(select(User.id).where(User.role == Role.STUDENT)).all()]
    evaluator_ids = [r for r in db.scalars(select(User.id).where(User.role == Role.EVALUATOR)).all()]
    assessment_service.assign(db, a, student_ids=student_ids, evaluator_ids=evaluator_ids or None)
    a = assessment_service.get_assessment(db, assessment_id)

    assessment_service.publish(db, a, actor_id=user.id, duration_minutes=body.duration_minutes if body else None)
    db.commit()
    # Each student's scenario self-heals on first open. Only pre-generate the whole
    # batch up front when explicitly enabled (costs one LLM call per student).
    if settings.EAGER_SCENARIO_GENERATION:
        dispatch_scenario_generation(db, assessment_id=assessment_id, actor_id=user.id)
    return assessment_out(db, assessment_service.get_assessment(db, assessment_id))


@router.post("/assessments/{assessment_id}/generate-scenarios", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED)
def generate_scenarios(assessment_id: uuid.UUID, db: Session = Depends(db_session), user: User = Depends(require_admin)):
    """Pre-generate a unique scenario for every assigned student (one LLM call each,
    runs in the background). Otherwise scenarios are created lazily on first open."""
    a = assessment_service.get_assessment(db, assessment_id)
    if a.status != AssessmentStatus.PUBLISHED:
        raise bad_request("NOT_PUBLISHED", "Publish the assessment before generating student papers.")
    job = dispatch_scenario_generation(db, assessment_id=assessment_id, actor_id=user.id)
    return JobOut.model_validate(db.get(type(job), job.id))


@router.post("/assignments", response_model=AssessmentOut)
def assignments(body: AssignRequest, db: Session = Depends(db_session)):
    a = assessment_service.get_assessment(db, body.assessment_id)
    assessment_service.assign(db, a, evaluator_ids=body.evaluator_ids, student_ids=body.student_ids)
    db.commit()
    return assessment_out(db, assessment_service.get_assessment(db, body.assessment_id))


# --------------------------------------------------------------------------- #
# People
# --------------------------------------------------------------------------- #
@router.get("/students", response_model=list[UserOut])
def list_students(db: Session = Depends(db_session)):
    return [UserOut.model_validate(u) for u in db.scalars(
        select(User).where(User.role == Role.STUDENT).order_by(User.name)
    ).all()]


@router.get("/evaluators", response_model=list[UserOut])
def list_evaluators(db: Session = Depends(db_session)):
    return [UserOut.model_validate(u) for u in db.scalars(
        select(User).where(User.role == Role.EVALUATOR).order_by(User.name)
    ).all()]


@router.post("/evaluators", response_model=CreateEvaluatorResponse, status_code=status.HTTP_201_CREATED)
def create_evaluator(body: CreateEvaluatorRequest, db: Session = Depends(db_session), user: User = Depends(require_admin)):
    """Creates an evaluator account with a freshly generated password, returned
    once in this response — the admin is responsible for passing it on."""
    if db.scalar(select(User).where(func.lower(User.email) == body.email.lower())):
        raise conflict("EMAIL_TAKEN", "An account with this email already exists.")
    password = generate_password()
    evaluator = User(
        name=body.name,
        email=body.email.lower(),
        password_hash=hash_password(password),
        role=Role.EVALUATOR,
        department=body.department,
        is_active=True,
    )
    db.add(evaluator)
    db.commit()
    db.refresh(evaluator)
    return CreateEvaluatorResponse(user=UserOut.model_validate(evaluator), username=evaluator.email, password=password)


# --------------------------------------------------------------------------- #
# Projects (admin creates; evaluators/students act on them)
# --------------------------------------------------------------------------- #
@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, db: Session = Depends(db_session), user: User = Depends(require_admin)):
    from app.models.project import Project, ProjectEvaluator, ProjectStudent

    default_rubric = body.rubric or [
        {"key": "documentation", "name": "Documentation", "max_marks": 20},
        {"key": "architecture", "name": "Architecture", "max_marks": 20},
        {"key": "code_quality", "name": "Code Quality", "max_marks": 20},
        {"key": "database", "name": "Database", "max_marks": 20},
        {"key": "functionality", "name": "Functionality", "max_marks": 20},
    ]
    project = Project(
        title=body.title, brief=body.brief, deadline=body.deadline,
        required_files=body.required_files or ["README.md"], optional_files=body.optional_files,
        rubric=default_rubric, created_by=user.id,
    )
    db.add(project)
    db.flush()
    for eid in body.evaluator_ids:
        db.add(ProjectEvaluator(project_id=project.id, evaluator_id=eid))
    for sid in body.student_ids:
        db.add(ProjectStudent(project_id=project.id, student_id=sid))
    db.commit()
    return ProjectOut.model_validate(project)


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(db_session)):
    from app.models.project import Project

    return [ProjectOut.model_validate(p) for p in db.scalars(select(Project).order_by(Project.created_at.desc())).all()]
