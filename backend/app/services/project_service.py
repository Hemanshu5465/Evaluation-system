from __future__ import annotations

import posixpath
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.storage import get_storage
from app.models.enums import AuditAction
from app.models.project import (
    Project,
    ProjectEvaluator,
    ProjectFile,
    ProjectStudent,
    ProjectSubmission,
)
from app.services import audit_service, notification_service
from app.services.zip_service import safe_extract


def student_can_access(db: Session, project_id: uuid.UUID, student_id: uuid.UUID) -> bool:
    return db.scalar(
        select(ProjectStudent).where(
            ProjectStudent.project_id == project_id, ProjectStudent.student_id == student_id
        )
    ) is not None


def evaluator_can_access(db: Session, project_id: uuid.UUID, evaluator_id: uuid.UUID) -> bool:
    return db.scalar(
        select(ProjectEvaluator).where(
            ProjectEvaluator.project_id == project_id, ProjectEvaluator.evaluator_id == evaluator_id
        )
    ) is not None


def list_projects_for_student(db: Session, student_id: uuid.UUID) -> list[Project]:
    return list(
        db.scalars(
            select(Project)
            .join(ProjectStudent, ProjectStudent.project_id == Project.id)
            .where(ProjectStudent.student_id == student_id, Project.is_active.is_(True))
            .order_by(Project.created_at.desc())
        ).all()
    )


def get_project(db: Session, project_id: uuid.UUID) -> Project:
    p = db.get(Project, project_id)
    if p is None:
        raise not_found("PROJECT_NOT_FOUND", "Project does not exist.")
    return p


def _latest_submission(db: Session, project_id: uuid.UUID, student_id: uuid.UUID) -> ProjectSubmission | None:
    return db.scalars(
        select(ProjectSubmission)
        .where(ProjectSubmission.project_id == project_id, ProjectSubmission.student_id == student_id)
        .order_by(ProjectSubmission.created_at.desc())
        .options(selectinload(ProjectSubmission.files))
    ).first()


def create_project_submission(
    db: Session, *, project: Project, student_id: uuid.UUID, data: bytes, filename: str
) -> ProjectSubmission:
    if not student_can_access(db, project.id, student_id):
        raise forbidden("NOT_ASSIGNED", "This project is not assigned to you.")
    if not filename.lower().endswith(".zip"):
        raise bad_request("BAD_FORMAT", "Only .zip archives are accepted.")

    prev = _latest_submission(db, project.id, student_id)
    if prev and prev.locked:
        raise conflict("ALREADY_SUBMITTED", "You have already submitted this project.")

    extraction = safe_extract(data)
    inventory = [f.path for f in extraction.files]
    dirs = {posixpath.dirname(p) + "/" for p in inventory if "/" in p}
    present = set(inventory) | dirs

    expected = [
        {"path": e, "type": "dir" if e.endswith("/") else "file"}
        for e in (project.required_files + project.optional_files)
    ]
    detected = []
    for e in expected:
        hit = any(x == e["path"] or x.endswith("/" + e["path"]) or x.startswith(e["path"]) for x in present)
        detected.append({**e, "present": hit})
    detected += [{"path": p, "type": "file", "present": True} for p in inventory if p not in [d["path"] for d in detected]][:50]

    missing_required = [
        e for e in project.required_files
        if not any(x == e or x.endswith("/" + e) or x.startswith(e) for x in present)
    ]

    storage = get_storage()
    key = storage.save(data, prefix=f"projects/{project.id}/{student_id}", filename=filename)

    sub = ProjectSubmission(
        project_id=project.id,
        student_id=student_id,
        original_filename=filename,
        storage_key=key,
        size_bytes=len(data),
        sha256=extraction.archive_sha256,
        status="READY" if not missing_required else "UPLOADED",
        validation_error=None if not missing_required else f"Missing required: {', '.join(missing_required)}",
        detected_structure=detected,
    )
    db.add(sub)
    db.flush()
    for ef in extraction.files:
        db.add(
            ProjectFile(
                submission_id=sub.id, path=ef.path, filename=ef.filename, extension=ef.extension,
                size_bytes=ef.size_bytes, mime_type=ef.mime_type, sha256=ef.sha256,
            )
        )
    db.flush()
    audit_service.record(
        db, action="PROJECT_SUBMITTED", user_id=student_id, entity_type="project_submission",
        entity_id=sub.id, metadata={"files": len(inventory), "missing_required": missing_required},
    )
    return sub


def submit_project(db: Session, *, submission: ProjectSubmission, student_id: uuid.UUID) -> ProjectSubmission:
    if submission.student_id != student_id:
        raise forbidden("NOT_OWNER", "This submission is not yours.")
    if submission.locked:
        raise conflict("ALREADY_SUBMITTED", "This project has already been submitted.")
    submission.status = "SUBMITTED"
    submission.submitted_at = datetime.now(UTC)
    submission.locked = True
    db.flush()
    audit_service.record(
        db, action=AuditAction.PROJECT_SUBMITTED, user_id=student_id,
        entity_type="project_submission", entity_id=submission.id,
    )
    project = db.get(Project, submission.project_id)
    for link in project.evaluator_links:
        notification_service.notify(
            db, user_id=link.evaluator_id, title="Project requires review",
            message=f"A student submitted a project for '{project.title}'.",
            ntype="PROJECT_SUBMITTED", entity_type="project_submission", entity_id=submission.id,
        )
    return submission


def get_submission_for_student(db: Session, submission_id: uuid.UUID, student_id: uuid.UUID) -> ProjectSubmission:
    s = db.scalars(
        select(ProjectSubmission).where(ProjectSubmission.id == submission_id).options(selectinload(ProjectSubmission.files))
    ).first()
    if s is None:
        raise not_found("PROJECT_SUBMISSION_NOT_FOUND", "Project submission does not exist.")
    if s.student_id != student_id:
        raise forbidden("NOT_OWNER", "This submission is not yours.")
    return s


def get_submission_for_evaluator(db: Session, submission_id: uuid.UUID, evaluator_id: uuid.UUID) -> ProjectSubmission:
    s = db.scalars(
        select(ProjectSubmission)
        .where(ProjectSubmission.id == submission_id)
        .options(selectinload(ProjectSubmission.files), selectinload(ProjectSubmission.evaluations))
    ).first()
    if s is None:
        raise not_found("PROJECT_SUBMISSION_NOT_FOUND", "Project submission does not exist.")
    if not evaluator_can_access(db, s.project_id, evaluator_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this project.")
    return s
