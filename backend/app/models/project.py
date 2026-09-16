from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Project(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    brief: Mapped[str] = mapped_column(Text, default="")
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    required_files: Mapped[list] = mapped_column(JSON, default=list)
    optional_files: Mapped[list] = mapped_column(JSON, default=list)
    rubric: Mapped[list] = mapped_column(JSON, default=list)  # [{key,name,max_marks}]
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)

    evaluator_links: Mapped[list["ProjectEvaluator"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    student_links: Mapped[list["ProjectStudent"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    submissions: Mapped[list["ProjectSubmission"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class ProjectEvaluator(UUIDMixin, Base):
    __tablename__ = "project_evaluators"
    __table_args__ = (UniqueConstraint("project_id", "evaluator_id", name="uq_project_evaluator"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    evaluator_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project: Mapped[Project] = relationship(back_populates="evaluator_links")


class ProjectStudent(UUIDMixin, Base):
    __tablename__ = "project_students"
    __table_args__ = (UniqueConstraint("project_id", "student_id", name="uq_project_student"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project: Mapped[Project] = relationship(back_populates="student_links")


class ProjectSubmission(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "project_submissions"

    project_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="UPLOADED", index=True)
    validation_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    detected_structure: Mapped[list] = mapped_column(JSON, default=list)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped[Project] = relationship(back_populates="submissions")
    files: Mapped[list["ProjectFile"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan"
    )
    evaluations: Mapped[list["ProjectEvaluation"]] = relationship(
        back_populates="submission", cascade="all, delete-orphan", order_by="ProjectEvaluation.version"
    )


class ProjectFile(UUIDMixin, Base):
    __tablename__ = "project_files"

    submission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("project_submissions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    extension: Mapped[str] = mapped_column(String(32), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    mime_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)

    submission: Mapped[ProjectSubmission] = relationship(back_populates="files")


class ProjectEvaluation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "project_evaluations"
    __table_args__ = (UniqueConstraint("submission_id", "version", name="uq_project_eval_version"),)

    submission_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("project_submissions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    stage: Mapped[str] = mapped_column(String(30), default="QUEUED", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage_history: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    overall_score: Mapped[float] = mapped_column(Float, default=0)
    max_score: Mapped[float] = mapped_column(Float, default=100)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    rubric_scores: Mapped[list] = mapped_column(JSON, default=list)
    checks: Mapped[list] = mapped_column(JSON, default=list)
    strengths: Mapped[list] = mapped_column(JSON, default=list)
    weaknesses: Mapped[list] = mapped_column(JSON, default=list)
    recommendations: Mapped[list] = mapped_column(JSON, default=list)
    explanation: Mapped[str] = mapped_column(Text, default="")

    ai_content_probability: Mapped[float] = mapped_column(Float, default=0)
    ai_content_classification: Mapped[str] = mapped_column(String(20), default="LOW")
    ai_content_confidence: Mapped[float] = mapped_column(Float, default=0)

    provider: Mapped[str] = mapped_column(String(40), default="mock")
    prompt_version: Mapped[str] = mapped_column(String(40), default="project_evaluator_v1")

    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    submission: Mapped[ProjectSubmission] = relationship(back_populates="evaluations")
