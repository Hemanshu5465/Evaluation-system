from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator


# --------------------------------------------------------------------------- #
# Syllabus analysis (name + code + structure, from an uploaded document)
# --------------------------------------------------------------------------- #
class SyllabusAnalysis(BaseModel):
    subject_name: str = Field(min_length=2, max_length=200)
    subject_code: str = Field(min_length=1, max_length=40)
    semester: str = ""
    description: str = ""
    difficulty: str = "MEDIUM"
    topics: list[str] = Field(default_factory=list)
    learning_outcomes: list[str] = Field(default_factory=list)

    @field_validator("subject_code")
    @classmethod
    def _clean_code(cls, v: str) -> str:
        return v.strip().upper().replace(" ", "-")[:40]

    @field_validator("semester")
    @classmethod
    def _clean_semester(cls, v: str) -> str:
        v = (v or "").strip()[:40]
        # "5" / "V" / "III" -> "Semester 5"; leave "Fall 2025", "Sem III" etc. as-is
        if v and re.fullmatch(r"\d{1,2}|[ivx]{1,4}", v, re.IGNORECASE):
            return f"Semester {v.upper()}"
        return v

    @field_validator("difficulty")
    @classmethod
    def _diff(cls, v: str) -> str:
        v = (v or "MEDIUM").upper()
        return v if v in {"EASY", "MEDIUM", "HARD"} else "MEDIUM"


# --------------------------------------------------------------------------- #
# Question generation
# --------------------------------------------------------------------------- #
class GenPart(BaseModel):
    part_number: int = Field(ge=1)
    prompt: str = Field(min_length=10)
    expected_concept: str = ""
    marks: int = Field(ge=0)


class GenRubricCriterion(BaseModel):
    key: str
    name: str
    max_marks: int = Field(ge=1)


class QuestionGenResult(BaseModel):
    title: str = Field(min_length=3)
    common_prompt: str = Field(min_length=30)
    parts: list[GenPart] = Field(min_length=1)
    instructions: list[str] = []
    constraints: list[str] = []
    expected_files: list[str] = []
    learning_objectives: list[str] = []
    difficulty: str = "MEDIUM"
    evaluation_rubric: list[GenRubricCriterion] = Field(min_length=1)

    @field_validator("evaluation_rubric")
    @classmethod
    def _rubric_sums_100(cls, v: list[GenRubricCriterion]) -> list[GenRubricCriterion]:
        total = sum(c.max_marks for c in v)
        if not (90 <= total <= 110):
            raise ValueError(f"rubric max_marks must total ~100, got {total}")
        return v


# --------------------------------------------------------------------------- #
# Scenario generation
# --------------------------------------------------------------------------- #
class ScenarioEntity(BaseModel):
    name: str
    columns: list[str]


class ScenarioGenResult(BaseModel):
    title: str = Field(min_length=3)
    domain: str = Field(min_length=2)
    scenario_text: str = Field(min_length=40)
    entities: list[ScenarioEntity] = Field(min_length=2)
    sample_records_note: str = ""
    variables: dict = {}


# --------------------------------------------------------------------------- #
# Answer evaluation (AI portion only; deterministic checks are separate)
# --------------------------------------------------------------------------- #
class AIRubricScore(BaseModel):
    key: str
    name: str
    score: float = Field(ge=0)
    max_score: float = Field(ge=0)
    evidence: list[str] = []

    @field_validator("score")
    @classmethod
    def _score_le_max(cls, v, info):
        mx = info.data.get("max_score")
        if mx is not None and v > mx + 1e-6:
            raise ValueError("score exceeds max_score")
        return v


class AnswerEvalResult(BaseModel):
    rubric_scores: list[AIRubricScore] = Field(min_length=1)
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendations: list[str] = []
    explanation: str = Field(min_length=20)
    confidence: float = Field(ge=0, le=1)
    # AI-generated-content estimate, produced in the same call to save a round-trip
    ai_content_probability: float = Field(default=0.0, ge=0, le=1)
    ai_content_classification: str = "LOW"
    ai_content_evidence: list[str] = []

    @field_validator("ai_content_classification")
    @classmethod
    def _valid_aic_class(cls, v: str) -> str:
        v = (v or "LOW").upper()
        return v if v in {"LOW", "MODERATE", "HIGH"} else "LOW"


# --------------------------------------------------------------------------- #
# AI-generated content detection
# --------------------------------------------------------------------------- #
class AIContentResult(BaseModel):
    estimated_probability: float = Field(ge=0, le=1)
    classification: str  # LOW | MODERATE | HIGH
    confidence: float = Field(ge=0, le=1)
    evidence: list[str] = []

    @field_validator("classification")
    @classmethod
    def _valid_class(cls, v: str) -> str:
        v = v.upper()
        if v not in {"LOW", "MODERATE", "HIGH"}:
            raise ValueError("classification must be LOW, MODERATE or HIGH")
        return v


# --------------------------------------------------------------------------- #
# Project evaluation
# --------------------------------------------------------------------------- #
class ProjectCheck(BaseModel):
    name: str
    passed: bool
    detail: str = ""


class ProjectEvalResult(BaseModel):
    rubric_scores: list[AIRubricScore] = Field(min_length=1)
    checks: list[ProjectCheck] = []
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendations: list[str] = []
    explanation: str = Field(min_length=20)
    confidence: float = Field(ge=0, le=1)
    ai_content_probability: float = Field(default=0.0, ge=0, le=1)
    ai_content_classification: str = "LOW"
    ai_content_evidence: list[str] = []

    @field_validator("ai_content_classification")
    @classmethod
    def _valid_aic_class(cls, v: str) -> str:
        v = (v or "LOW").upper()
        return v if v in {"LOW", "MODERATE", "HIGH"} else "LOW"
