from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from sqlalchemy import func, select

from app.core.errors import bad_request, conflict, not_found
from app.core.storage import get_storage
from app.models.academic import Subject, Syllabus, SyllabusTopic
from app.models.enums import ProcessingStatus
from app.services import audit_service
from app.services.document_extraction import (
    ALLOWED_SYLLABUS_EXT,
    UnsupportedDocument,
    extract_text,
    heuristic_structure,
)


def analyze_and_create_subject(
    db: Session,
    *,
    data: bytes,
    filename: str,
    content_type: str,
    actor_id: uuid.UUID,
):
    """Upload a syllabus, let AI read the subject name/code + structure out of it,
    and create the Subject + a PROCESSED Syllabus in one shot. Returns the analysis.
    """
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_SYLLABUS_EXT:
        raise bad_request("BAD_SYLLABUS_TYPE", "Syllabus must be a PDF, DOCX or TXT file.")
    if not data:
        raise bad_request("EMPTY_FILE", "Uploaded file is empty.")
    if len(data) > 25 * 1024 * 1024:
        raise bad_request("SYLLABUS_TOO_LARGE", "Syllabus file exceeds the 25 MB limit.")

    try:
        text = extract_text(data, filename=filename, content_type=content_type or "application/octet-stream")
    except UnsupportedDocument as e:
        raise bad_request("EXTRACT_FAILED", str(e))
    if not text.strip():
        raise bad_request("EXTRACT_FAILED", "No readable text found in the document.")

    from app.ai.syllabus_analyzer import PROMPT_VERSION, analyze_syllabus

    analysis = analyze_syllabus(text)

    # reuse an existing subject with the same code, else create a new one
    subject = db.scalar(select(Subject).where(func.lower(Subject.code) == analysis.subject_code.lower()))
    if subject is None:
        active = db.scalar(select(func.count()).select_from(Subject).where(Subject.is_active.is_(True))) or 0
        from app.core.config import settings

        if active >= settings.MAX_ACTIVE_SUBJECTS:
            raise conflict("SUBJECT_LIMIT_REACHED", f"Maximum of {settings.MAX_ACTIVE_SUBJECTS} active subjects reached.")
        subject = Subject(
            name=analysis.subject_name,
            code=analysis.subject_code,
            semester=analysis.semester,
            description=analysis.description,
            created_by=actor_id,
            is_active=True,
        )
        db.add(subject)
        db.flush()
    else:
        subject.name = analysis.subject_name
        subject.semester = analysis.semester or subject.semester
        subject.description = analysis.description or subject.description

    storage = get_storage()
    key = storage.save(data, prefix=f"syllabi/{subject.id}", filename=filename)

    if subject.syllabus is not None:
        db.delete(subject.syllabus)
        db.flush()

    syllabus = Syllabus(
        subject_id=subject.id,
        title=subject.name,
        description=analysis.description,
        difficulty=analysis.difficulty,
        source_filename=filename,
        source_content_type=content_type or "application/octet-stream",
        storage_key=key,
        size_bytes=len(data),
        processing_status=ProcessingStatus.PROCESSED,
        extracted_text=text[:200_000],
        learning_outcomes=analysis.learning_outcomes,
    )
    db.add(syllabus)
    db.flush()
    for i, topic in enumerate(analysis.topics):
        db.add(SyllabusTopic(syllabus_id=syllabus.id, name=topic, order_index=i))

    audit_service.record(
        db,
        action="SYLLABUS_UPLOAD",
        user_id=actor_id,
        entity_type="syllabus",
        entity_id=syllabus.id,
        metadata={"filename": filename, "subject_code": subject.code, "prompt_version": PROMPT_VERSION},
    )
    db.flush()
    return subject, analysis


def upload_syllabus(
    db: Session,
    *,
    subject: Subject,
    data: bytes,
    filename: str,
    content_type: str,
    actor_id: uuid.UUID,
) -> Syllabus:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_SYLLABUS_EXT:
        raise bad_request("BAD_SYLLABUS_TYPE", "Syllabus must be a PDF, DOCX or TXT file.")
    if not data:
        raise bad_request("EMPTY_FILE", "Uploaded file is empty.")
    if len(data) > 25 * 1024 * 1024:
        raise bad_request("SYLLABUS_TOO_LARGE", "Syllabus file exceeds the 25 MB limit.")

    storage = get_storage()
    key = storage.save(data, prefix=f"syllabi/{subject.id}", filename=filename)

    if subject.syllabus is not None:
        db.delete(subject.syllabus)
        db.flush()

    syllabus = Syllabus(
        subject_id=subject.id,
        source_filename=filename,
        source_content_type=content_type or "application/octet-stream",
        storage_key=key,
        size_bytes=len(data),
        processing_status=ProcessingStatus.UPLOADED,
        title=subject.name,
    )
    db.add(syllabus)
    db.flush()
    audit_service.record(
        db,
        action="SYLLABUS_UPLOAD",
        user_id=actor_id,
        entity_type="syllabus",
        entity_id=syllabus.id,
        metadata={"filename": filename, "size": len(data)},
    )
    return syllabus


def process_syllabus(db: Session, syllabus_id: uuid.UUID, *, progress=None) -> Syllabus:
    """Runs in a background worker. Extracts text, topics and learning outcomes."""
    syllabus = db.get(Syllabus, syllabus_id)
    if syllabus is None:
        raise not_found("SYLLABUS_NOT_FOUND", "Syllabus does not exist.")

    syllabus.processing_status = ProcessingStatus.PROCESSING
    syllabus.processing_error = None
    db.flush()
    if progress:
        progress(15, "Reading document")

    try:
        storage = get_storage()
        data = storage.load(syllabus.storage_key)
        text = extract_text(data, filename=syllabus.source_filename, content_type=syllabus.source_content_type)
        if not text.strip():
            raise UnsupportedDocument("No extractable text found in the document.")
        syllabus.extracted_text = text[:200_000]
        if progress:
            progress(45, "Extracting topics")

        topics, outcomes = heuristic_structure(text)

        # If the heuristic is thin, ask the AI provider to structure it.
        if len(topics) < 5:
            topics, outcomes = _ai_structure(text, fallback_topics=topics, fallback_outcomes=outcomes)
        if progress:
            progress(80, "Analyzing learning outcomes")

        for t in list(syllabus.topics):
            db.delete(t)
        db.flush()
        for i, name in enumerate(topics):
            db.add(SyllabusTopic(syllabus_id=syllabus.id, name=name, order_index=i))

        syllabus.learning_outcomes = outcomes or [
            f"Apply {syllabus.subject.name} concepts to unfamiliar scenarios",
            "Produce correct, well-structured solutions with justification",
        ]
        syllabus.processing_status = ProcessingStatus.PROCESSED
        if progress:
            progress(100, "Processed")
    except Exception as e:
        syllabus.processing_status = ProcessingStatus.FAILED
        syllabus.processing_error = str(e)[:2000]
        db.flush()
        raise
    db.flush()
    return syllabus


def _ai_structure(text: str, *, fallback_topics: list[str], fallback_outcomes: list[str]) -> tuple[list[str], list[str]]:
    from app.ai.provider import MockProvider, get_ai_provider

    provider = get_ai_provider()
    if isinstance(provider, MockProvider):
        return (fallback_topics or _keyword_topics(text)), fallback_outcomes

    from pydantic import BaseModel, Field

    class _S(BaseModel):
        topics: list[str] = Field(min_length=3)
        learning_outcomes: list[str] = []

    try:
        res = provider.complete_json(
            system="# TASK: syllabus_structure\nExtract the list of teaching topics and learning outcomes from the syllabus text.",
            user=f'SYLLABUS:\n"""\n{text[:12000]}\n"""\nReturn JSON: {{"topics": [...], "learning_outcomes": [...]}}',
            schema=_S,
            max_tokens=1500,
        )
        return res.topics[:40], res.learning_outcomes[:20]
    except Exception:
        return (fallback_topics or _keyword_topics(text)), fallback_outcomes


def _keyword_topics(text: str) -> list[str]:
    import re
    from collections import Counter

    words = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", text.lower())
    stop = {"this", "that", "with", "from", "will", "shall", "which", "students", "course", "unit"}
    common = [w for w, _ in Counter(w for w in words if w not in stop).most_common(20)]
    return [w.title() for w in common[:12]]
