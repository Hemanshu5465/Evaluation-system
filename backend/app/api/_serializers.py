from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.academic import (
    Assessment,
    AssessmentEvaluator,
    AssessmentStudent,
    StudentScenario,
    Subject,
)
from app.models.project import Project, ProjectEvaluation, ProjectSubmission
from app.models.submission import AIEvaluation, ManualEvaluation, Submission
from app.models.user import User
from app.schemas import AssessmentOut, ManualEvaluationOut, ProjectSubmissionOut, SubmissionOut


def assessment_out(db: Session, a: Assessment) -> AssessmentOut:
    out = AssessmentOut.model_validate(a)
    subject = db.get(Subject, a.subject_id)
    out.subject_name = subject.name if subject else None
    out.evaluator_ids = [
        r for r in db.scalars(
            select(AssessmentEvaluator.evaluator_id).where(AssessmentEvaluator.assessment_id == a.id)
        ).all()
    ]
    out.student_ids = [
        r for r in db.scalars(
            select(AssessmentStudent.student_id).where(AssessmentStudent.assessment_id == a.id)
        ).all()
    ]
    out.scenario_count = len(
        db.scalars(select(StudentScenario.id).where(StudentScenario.assessment_id == a.id)).all()
    )
    return out


def submission_out(db: Session, s: Submission, *, include_manual: bool = False) -> SubmissionOut:
    out = SubmissionOut.model_validate(s)
    student = db.get(User, s.student_id)
    assessment = db.get(Assessment, s.assessment_id)
    subject = db.get(Subject, assessment.subject_id) if assessment else None
    out.student_name = student.name if student else None
    out.student_code = student.student_id if student else None
    out.assessment_title = assessment.title if assessment else None
    out.subject_name = subject.name if subject else None
    out.scenario_id = s.scenario_id

    latest_ai = db.scalars(
        select(AIEvaluation).where(AIEvaluation.submission_id == s.id).order_by(AIEvaluation.version.desc())
    ).first()
    if latest_ai:
        out.ai_evaluation_id = latest_ai.id
        out.ai_stage = latest_ai.stage
        out.ai_progress = latest_ai.progress
        out.ai_score = latest_ai.overall_score if latest_ai.stage in ("COMPLETED", "PUBLISHED") else None
        out.ai_published = latest_ai.published

    manual = db.scalar(select(ManualEvaluation).where(ManualEvaluation.submission_id == s.id))
    out.manual_status = manual.status if manual else None
    if include_manual and manual:
        out.manual_evaluation = ManualEvaluationOut.model_validate(manual)

    if s.scenario_id:
        scn = db.get(StudentScenario, s.scenario_id)
        if scn:
            out.scenario_code = scn.scenario_code
            out.scenario_title = scn.title
            out.scenario_domain = scn.domain
            out.scenario_text = scn.scenario_text
            out.scenario_entities = (scn.scenario_variables or {}).get("entities", [])
    return out


def project_submission_out(db: Session, s: ProjectSubmission) -> ProjectSubmissionOut:
    out = ProjectSubmissionOut.model_validate(s)
    project = db.get(Project, s.project_id)
    student = db.get(User, s.student_id)
    out.project_title = project.title if project else None
    out.student_name = student.name if student else None
    out.student_code = student.student_id if student else None
    ev = db.scalars(
        select(ProjectEvaluation)
        .where(ProjectEvaluation.submission_id == s.id)
        .order_by(ProjectEvaluation.version.desc())
    ).first()
    if ev:
        out.evaluation_id = ev.id
        out.evaluation_stage = ev.stage
        out.evaluation_score = ev.overall_score if ev.stage in ("COMPLETED", "PUBLISHED") else None
        out.evaluation_published = ev.published
    return out
