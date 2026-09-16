from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Subject(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "subjects"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    semester: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)

    syllabus: Mapped["Syllabus | None"] = relationship(
        back_populates="subject", uselist=False, cascade="all, delete-orphan"
    )
    assessments: Mapped[list["Assessment"]] = relationship(back_populates="subject")


class Syllabus(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "syllabi"

    subject_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("subjects.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[str] = mapped_column(String(20), default="MEDIUM")

    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)

    processing_status: Mapped[str] = mapped_column(String(20), default="UPLOADED", index=True)
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    learning_outcomes: Mapped[list] = mapped_column(JSON, default=list)

    subject: Mapped[Subject] = relationship(back_populates="syllabus")
    topics: Mapped[list["SyllabusTopic"]] = relationship(
        back_populates="syllabus", cascade="all, delete-orphan", order_by="SyllabusTopic.order_index"
    )


class SyllabusTopic(UUIDMixin, Base):
    __tablename__ = "syllabus_topics"

    syllabus_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("syllabi.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    subtopics: Mapped[list] = mapped_column(JSON, default=list)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    syllabus: Mapped[Syllabus] = relationship(back_populates="topics")


class Assessment(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "assessments"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("subjects.id"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", index=True)
    difficulty: Mapped[str] = mapped_column(String(20), default="MEDIUM")
    allow_resubmission: Mapped[bool] = mapped_column(Boolean, default=False)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Optional per-question time limit, set by the admin at publish time. The clock
    # starts individually for each student (AssessmentStudent.started_at), the first
    # time they open the question — not a shared deadline for everyone.
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    allowed_formats: Mapped[list] = mapped_column(JSON, default=lambda: [".zip"])
    generation_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True)

    subject: Mapped[Subject] = relationship(back_populates="assessments")
    question: Mapped["Question | None"] = relationship(
        back_populates="assessment", uselist=False, cascade="all, delete-orphan"
    )
    rubric_criteria: Mapped[list["RubricCriterion"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan", order_by="RubricCriterion.order_index"
    )
    scenarios: Mapped[list["StudentScenario"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )
    evaluator_links: Mapped[list["AssessmentEvaluator"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )
    student_links: Mapped[list["AssessmentStudent"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )


class Question(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "questions"

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    common_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    instructions: Mapped[list] = mapped_column(JSON, default=list)
    constraints: Mapped[list] = mapped_column(JSON, default=list)
    expected_files: Mapped[list] = mapped_column(JSON, default=list)
    learning_objectives: Mapped[list] = mapped_column(JSON, default=list)
    prompt_version: Mapped[str] = mapped_column(String(40), default="question_generator_v1")

    assessment: Mapped[Assessment] = relationship(back_populates="question")
    parts: Mapped[list["QuestionPart"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", order_by="QuestionPart.part_number"
    )


class QuestionPart(UUIDMixin, Base):
    __tablename__ = "question_parts"
    __table_args__ = (UniqueConstraint("question_id", "part_number", name="uq_question_part_number"),)

    question_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    part_number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(20), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    expected_concept: Mapped[str] = mapped_column(Text, default="")
    marks: Mapped[int] = mapped_column(Integer, default=0)

    question: Mapped[Question] = relationship(back_populates="parts")


class RubricCriterion(UUIDMixin, Base):
    __tablename__ = "evaluation_rubrics"
    __table_args__ = (UniqueConstraint("assessment_id", "key", name="uq_rubric_key"),)

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    key: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    max_marks: Mapped[int] = mapped_column(Integer, nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    assessment: Mapped[Assessment] = relationship(back_populates="rubric_criteria")


class StudentScenario(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "student_scenarios"
    __table_args__ = (UniqueConstraint("assessment_id", "student_id", name="uq_scenario_student"),)

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    scenario_code: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    domain: Mapped[str] = mapped_column(String(120), nullable=False)
    scenario_text: Mapped[str] = mapped_column(Text, nullable=False)
    scenario_variables: Mapped[dict] = mapped_column(JSON, default=dict)
    scenario_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(40), default="scenario_generator_v1")

    assessment: Mapped[Assessment] = relationship(back_populates="scenarios")


class AssessmentEvaluator(UUIDMixin, Base):
    __tablename__ = "assessment_evaluators"
    __table_args__ = (UniqueConstraint("assessment_id", "evaluator_id", name="uq_assessment_evaluator"),)

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    evaluator_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    assessment: Mapped[Assessment] = relationship(back_populates="evaluator_links")


class AssessmentStudent(UUIDMixin, Base):
    __tablename__ = "assessment_students"
    __table_args__ = (UniqueConstraint("assessment_id", "student_id", name="uq_assessment_student"),)

    assessment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("assessments.id", ondelete="CASCADE"), index=True, nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Set the first time THIS student opens the question — the per-student timer
    # start, independent of when the assessment was published or other students open it.
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assessment: Mapped[Assessment] = relationship(back_populates="student_links")
