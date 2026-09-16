"""SQLAlchemy models. Importing this package registers every table on Base.metadata."""

from app.models.base import Base
from app.models.user import RefreshToken, User
from app.models.academic import (
    Assessment,
    AssessmentEvaluator,
    AssessmentStudent,
    Question,
    QuestionPart,
    RubricCriterion,
    StudentScenario,
    Subject,
    Syllabus,
    SyllabusTopic,
)
from app.models.submission import (
    AIEvaluation,
    AITestCase,
    ManualEvaluation,
    Submission,
    SubmissionFile,
)
from app.models.project import (
    Project,
    ProjectEvaluation,
    ProjectEvaluator,
    ProjectFile,
    ProjectStudent,
    ProjectSubmission,
)
from app.models.system import AuditLog, Job, Notification

__all__ = [
    "Base",
    "User",
    "RefreshToken",
    "Subject",
    "Syllabus",
    "SyllabusTopic",
    "Assessment",
    "Question",
    "QuestionPart",
    "RubricCriterion",
    "StudentScenario",
    "AssessmentEvaluator",
    "AssessmentStudent",
    "Submission",
    "SubmissionFile",
    "AIEvaluation",
    "AITestCase",
    "ManualEvaluation",
    "Project",
    "ProjectEvaluator",
    "ProjectStudent",
    "ProjectSubmission",
    "ProjectFile",
    "ProjectEvaluation",
    "Notification",
    "AuditLog",
    "Job",
]
