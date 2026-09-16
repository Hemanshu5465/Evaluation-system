from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    role: str = Field(pattern="^(ADMIN|EVALUATOR|STUDENT)$")
    student_id: str | None = Field(default=None, max_length=60)
    department: str | None = None


class LoginRequest(BaseModel):
    # Accepts an email OR an enrollment / student number. `email` kept for
    # backwards compatibility; `identifier` is preferred.
    identifier: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = None
    password: str

    @property
    def login_id(self) -> str:
        return (self.identifier or self.email or "").strip()


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(ORMModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    student_id: str | None = None
    department: str | None = None
    is_active: bool
    created_at: datetime


class CreateEvaluatorRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    department: str | None = None


class CreateEvaluatorResponse(BaseModel):
    user: UserOut
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserOut


# --------------------------------------------------------------------------- #
# Subjects & syllabus
# --------------------------------------------------------------------------- #
class SubjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=60)
    semester: str = ""
    description: str = ""


class SubjectUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    semester: str | None = None
    description: str | None = None
    is_active: bool | None = None


class SyllabusAnalysisOut(BaseModel):
    subject_id: uuid.UUID
    subject_name: str
    subject_code: str
    semester: str
    description: str
    difficulty: str
    topics: list[str]
    learning_outcomes: list[str]


class SyllabusTopicOut(ORMModel):
    id: uuid.UUID
    name: str
    subtopics: list = []
    order_index: int


class SyllabusOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str
    difficulty: str
    source_filename: str
    processing_status: str
    processing_error: str | None = None
    learning_outcomes: list = []
    topics: list[SyllabusTopicOut] = []
    created_at: datetime
    updated_at: datetime


class SubjectOut(ORMModel):
    id: uuid.UUID
    name: str
    code: str
    semester: str = ""
    description: str
    is_active: bool
    created_at: datetime
    syllabus: SyllabusOut | None = None


# --------------------------------------------------------------------------- #
# Assessments / questions / scenarios
# --------------------------------------------------------------------------- #
class GenerateAssessmentRequest(BaseModel):
    subject_id: uuid.UUID
    title: str | None = None
    difficulty: str = Field(default="MEDIUM", pattern="^(EASY|MEDIUM|HARD|ADVANCED)$")
    topics: list[str] = []
    number_of_parts: int = Field(default=4, ge=2, le=5)
    deadline: datetime | None = None
    # What was actually taught in class (a topic list, lecture notes, or example
    # questions). When given, the question is generated strictly from this instead
    # of the full syllabus, so it stays solvable by students at their real level.
    class_coverage: str | None = Field(default=None, max_length=12000)


class AssignRequest(BaseModel):
    assessment_id: uuid.UUID
    evaluator_ids: list[uuid.UUID] | None = None
    student_ids: list[uuid.UUID] | None = None


class PublishAssessmentRequest(BaseModel):
    # Optional per-question time limit. Left unset -> no timer, same as before.
    duration_minutes: int | None = Field(default=None, ge=1, le=600)


class QuestionPartOut(ORMModel):
    part_number: int
    label: str
    prompt: str
    expected_concept: str
    marks: int


class QuestionOut(ORMModel):
    id: uuid.UUID
    title: str
    common_prompt: str
    instructions: list = []
    constraints: list = []
    expected_files: list = []
    learning_objectives: list = []
    parts: list[QuestionPartOut] = []


class RubricCriterionOut(ORMModel):
    key: str
    name: str
    max_marks: int
    order_index: int


class AssessmentOut(ORMModel):
    id: uuid.UUID
    title: str
    subject_id: uuid.UUID
    subject_name: str | None = None
    status: str
    difficulty: str
    deadline: datetime | None = None
    published_at: datetime | None = None
    generation_error: str | None = None
    created_at: datetime
    question: QuestionOut | None = None
    rubric_criteria: list[RubricCriterionOut] = []
    evaluator_ids: list[uuid.UUID] = []
    student_ids: list[uuid.UUID] = []
    scenario_count: int = 0
    # Per-question timer. duration_minutes is set by the admin at publish time.
    # started_at / expires_at are specific to the CALLING student and only ever
    # populated on student-facing endpoints — never set for admin/evaluator views.
    duration_minutes: int | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None


class ScenarioOut(ORMModel):
    id: uuid.UUID
    student_id: uuid.UUID | None = None
    scenario_code: str
    title: str
    domain: str
    scenario_text: str
    scenario_variables: dict = {}
    prompt_version: str


class ScenarioWithStudentOut(ScenarioOut):
    student_name: str | None = None
    student_code: str | None = None


class StudentAssessmentView(BaseModel):
    assessment: AssessmentOut
    scenario: ScenarioOut | None = None
    submission_status: str | None = None


# --------------------------------------------------------------------------- #
# Submissions & evaluation
# --------------------------------------------------------------------------- #
class SubmissionFileOut(ORMModel):
    path: str
    filename: str
    extension: str
    size_bytes: int
    mime_type: str
    sha256: str
    is_text: bool


class SubmissionOut(ORMModel):
    id: uuid.UUID
    assessment_id: uuid.UUID
    student_id: uuid.UUID
    original_filename: str
    size_bytes: int
    sha256: str
    status: str
    version: int
    attempt_number: int
    submitted_at: datetime | None = None
    locked: bool
    created_at: datetime
    files: list[SubmissionFileOut] = []
    # enriched (populated by the serializer, not the ORM)
    assessment_title: str | None = None
    subject_name: str | None = None
    student_name: str | None = None
    student_code: str | None = None
    scenario_id: uuid.UUID | None = None
    ai_evaluation_id: uuid.UUID | None = None
    ai_stage: str | None = None
    ai_progress: int | None = None
    ai_score: float | None = None
    ai_published: bool = False
    manual_status: str | None = None
    scenario_code: str | None = None
    scenario_title: str | None = None
    scenario_domain: str | None = None
    scenario_text: str | None = None
    scenario_entities: list = []
    manual_evaluation: "ManualEvaluationOut | None" = None  # evaluator-only, populated on evaluator routes


class AITestCaseOut(ORMModel):
    code: str
    name: str
    category: str
    description: str
    expected: str
    actual: str
    passed: bool
    score: float
    max_score: float
    explanation: str
    evidence: list = []


class AIEvaluationOut(ORMModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    version: int
    stage: str
    progress: int
    stage_history: list = []
    error: str | None = None
    overall_score: float
    max_score: float
    confidence: float
    rubric_scores: list = []
    strengths: list = []
    weaknesses: list = []
    recommendations: list = []
    explanation: str
    ai_content_probability: float
    ai_content_classification: str
    ai_content_confidence: float
    ai_content_evidence: list = []
    provider: str
    prompt_version: str
    published: bool
    published_at: datetime | None = None
    completed_at: datetime | None = None
    test_cases: list[AITestCaseOut] = []


class ManualEvaluationRequest(BaseModel):
    scores: dict[str, float]
    comments: str = ""
    strengths: str = ""
    improvements: str = ""
    status: str = Field(default="DRAFT", pattern="^(DRAFT|COMPLETED)$")


class ManualEvaluationOut(ORMModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    evaluator_id: uuid.UUID
    status: str
    scores: dict = {}
    total: float
    max_total: float
    comments: str
    strengths: str
    improvements: str
    submitted_at: datetime | None = None
    updated_at: datetime


class StartEvaluationResponse(BaseModel):
    evaluation_id: uuid.UUID
    job_id: uuid.UUID | None = None
    status: str


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #
class ProjectCreate(BaseModel):
    title: str
    brief: str = ""
    deadline: datetime | None = None
    required_files: list[str] = []
    optional_files: list[str] = []
    rubric: list[dict] = []
    evaluator_ids: list[uuid.UUID] = []
    student_ids: list[uuid.UUID] = []


class ProjectOut(ORMModel):
    id: uuid.UUID
    title: str
    brief: str
    deadline: datetime | None = None
    required_files: list = []
    optional_files: list = []
    rubric: list = []
    is_active: bool
    created_at: datetime


class ProjectSubmissionOut(ORMModel):
    id: uuid.UUID
    project_id: uuid.UUID
    student_id: uuid.UUID
    original_filename: str
    size_bytes: int
    status: str
    validation_error: str | None = None
    detected_structure: list = []
    submitted_at: datetime | None = None
    locked: bool
    created_at: datetime
    project_title: str | None = None
    student_name: str | None = None
    student_code: str | None = None
    evaluation_id: uuid.UUID | None = None
    evaluation_stage: str | None = None
    evaluation_score: float | None = None
    evaluation_published: bool = False


class ProjectEvaluationOut(ORMModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    version: int
    stage: str
    progress: int
    stage_history: list = []
    error: str | None = None
    overall_score: float
    max_score: float
    confidence: float
    rubric_scores: list = []
    checks: list = []
    strengths: list = []
    weaknesses: list = []
    recommendations: list = []
    explanation: str
    ai_content_probability: float
    ai_content_classification: str
    published: bool
    completed_at: datetime | None = None


# --------------------------------------------------------------------------- #
# Notifications / jobs
# --------------------------------------------------------------------------- #
class NotificationOut(ORMModel):
    id: uuid.UUID
    title: str
    message: str
    type: str
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    is_read: bool
    created_at: datetime


class JobOut(ORMModel):
    id: uuid.UUID
    kind: str
    status: str
    progress: int
    stage: str
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    result: dict = {}
    error: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime


SubmissionOut.model_rebuild()
