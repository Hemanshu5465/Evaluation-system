from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.storage import get_storage
from app.models.academic import Assessment
from app.models.enums import AssessmentStatus, SubmissionStatus
from app.models.submission import Submission, SubmissionFile
from app.services import audit_service, notification_service, scenario_service
from app.services.assessment_service import evaluator_can_access, student_assigned, time_status
from app.services.zip_service import safe_extract


def _active_submission(db: Session, assessment_id: uuid.UUID, student_id: uuid.UUID) -> Submission | None:
    return db.scalars(
        select(Submission)
        .where(Submission.assessment_id == assessment_id, Submission.student_id == student_id)
        .order_by(Submission.version.desc())
        .options(selectinload(Submission.files))
    ).first()


def create_submission(
    db: Session, *, assessment: Assessment, student_id: uuid.UUID, data: bytes, filename: str
) -> Submission:
    if assessment.status != AssessmentStatus.PUBLISHED:
        raise bad_request("ASSESSMENT_NOT_OPEN", "This assessment is not open for submissions.")
    if not student_assigned(db, student_id, assessment.id):
        raise forbidden("NOT_ASSIGNED", "This assessment is not assigned to you.")
    if not filename.lower().endswith(".zip"):
        raise bad_request("BAD_FORMAT", "Only .zip archives are accepted.")
    if time_status(db, assessment, student_id)["expired"]:
        raise bad_request("TIME_EXPIRED", "The time limit for this question has ended. New uploads are no longer accepted.")

    prev = _active_submission(db, assessment.id, student_id)
    if prev and prev.status == SubmissionStatus.SUBMITTED and not assessment.allow_resubmission:
        raise conflict("ALREADY_SUBMITTED", "You have already submitted and resubmission is disabled.")

    # Secure extraction (raises AppError on any violation).
    extraction = safe_extract(data)

    storage = get_storage()
    key = storage.save(data, prefix=f"submissions/{assessment.id}/{student_id}", filename=filename)

    scenario = scenario_service.get_student_scenario(db, assessment_id=assessment.id, student_id=student_id)

    version = (prev.version + 1) if prev else 1
    submission = Submission(
        assessment_id=assessment.id,
        student_id=student_id,
        scenario_id=scenario.id,
        original_filename=filename,
        storage_key=key,
        size_bytes=len(data),
        sha256=extraction.archive_sha256,
        status=SubmissionStatus.READY,
        attempt_number=version,
        version=version,
    )
    db.add(submission)
    db.flush()

    for ef in extraction.files:
        db.add(
            SubmissionFile(
                submission_id=submission.id,
                path=ef.path,
                filename=ef.filename,
                extension=ef.extension,
                size_bytes=ef.size_bytes,
                mime_type=ef.mime_type,
                sha256=ef.sha256,
                is_text=ef.is_text,
            )
        )
    db.flush()
    audit_service.record(
        db, action="SUBMISSION_CREATED", user_id=student_id, entity_type="submission", entity_id=submission.id,
        metadata={"files": len(extraction.files), "bytes": len(data)},
    )
    return submission


def submit(db: Session, *, submission: Submission, student_id: uuid.UUID) -> Submission:
    if submission.student_id != student_id:
        raise forbidden("NOT_OWNER", "This submission is not yours.")
    if submission.status == SubmissionStatus.SUBMITTED:
        raise conflict("ALREADY_SUBMITTED", "This submission has already been submitted.")
    if submission.status != SubmissionStatus.READY:
        raise bad_request("NOT_READY", f"Submission is in state {submission.status} and cannot be submitted.")

    submission.status = SubmissionStatus.SUBMITTED
    submission.submitted_at = datetime.now(UTC)
    submission.locked = True
    db.flush()

    audit_service.record(
        db, action="SUBMISSION_SUBMITTED", user_id=student_id, entity_type="submission", entity_id=submission.id
    )
    assessment = db.get(Assessment, submission.assessment_id)
    for link in assessment.evaluator_links:
        notification_service.notify(
            db,
            user_id=link.evaluator_id,
            title="New student submission received",
            message=f"A submission for '{assessment.title}' is ready for evaluation.",
            ntype="SUBMISSION_RECEIVED",
            entity_type="submission",
            entity_id=submission.id,
        )
    return submission


def get_for_student(db: Session, submission_id: uuid.UUID, student_id: uuid.UUID) -> Submission:
    s = db.scalars(
        select(Submission).where(Submission.id == submission_id).options(selectinload(Submission.files))
    ).first()
    if s is None:
        raise not_found("SUBMISSION_NOT_FOUND", "Submission does not exist.")
    if s.student_id != student_id:
        raise forbidden("NOT_OWNER", "This submission is not yours.")
    return s


def get_for_evaluator(db: Session, submission_id: uuid.UUID, evaluator_id: uuid.UUID) -> Submission:
    s = db.scalars(
        select(Submission)
        .where(Submission.id == submission_id)
        .options(selectinload(Submission.files), selectinload(Submission.ai_evaluations), selectinload(Submission.manual_evaluation))
    ).first()
    if s is None:
        raise not_found("SUBMISSION_NOT_FOUND", "Submission does not exist.")
    if not evaluator_can_access(db, evaluator_id, s.assessment_id):
        raise forbidden("NOT_ASSIGNED", "You are not assigned to this assessment.")
    return s


def load_file_contents(db: Session, submission: Submission) -> dict[str, str]:
    """Re-extract text files from the stored archive for evaluation."""
    storage = get_storage()
    data = storage.load(submission.storage_key)
    extraction = safe_extract(data)
    from app.services.zip_service import decode_text

    return {f.path: decode_text(f) for f in extraction.files if f.is_text}


def load_one_file(db: Session, submission: Submission, path: str, *, max_chars: int = 400_000) -> dict:
    """Return the content of a single file from the stored archive, for viewing."""
    from app.services.zip_service import decode_text

    storage = get_storage()
    extraction = safe_extract(storage.load(submission.storage_key))
    match = next((f for f in extraction.files if f.path == path or f.path.split("/")[-1] == path), None)
    if match is None:
        raise not_found("FILE_NOT_FOUND", "That file is not in the submission archive.")

    # Extension isn't in the known-text list (Makefile, Dockerfile, .env, LICENSE…) —
    # treat it as text anyway if the bytes decode cleanly and hold no NUL bytes.
    is_text = match.is_text
    if not is_text and match.data and b"\x00" not in match.data[:8192]:
        try:
            match.data.decode("utf-8")
            is_text = True
        except UnicodeDecodeError:
            is_text = False

    if not is_text:
        return {"path": match.path, "is_text": False, "size_bytes": match.size_bytes, "content": "", "truncated": False}
    text = decode_text(match)
    return {
        "path": match.path,
        "is_text": True,
        "size_bytes": match.size_bytes,
        "content": text[:max_chars],
        "truncated": len(text) > max_chars,
    }
