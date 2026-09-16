from __future__ import annotations

import re

from app.ai.prompts import PROMPT_VERSIONS
from app.ai.provider import MockProvider, get_ai_provider
from app.ai.schemas import SyllabusAnalysis
from app.services.document_extraction import heuristic_structure

PROMPT_VERSION = PROMPT_VERSIONS.get("syllabus_analyzer", "syllabus_analyzer_v1")

SYSTEM = """\
# TASK: syllabus_analysis
You are given the raw text of a course syllabus. Extract:
- subject_name: the official course / subject title.
- subject_code: the course code exactly as written (e.g. "CS301", "3140705"). If no code
  appears anywhere, invent a short uppercase code derived from the subject name.
- semester: the semester / term the course belongs to, exactly as written (e.g. "Semester 5",
  "Sem III", "Fall 2025", "Term 2"). Empty string if the syllabus does not mention one.
- description: one sentence describing the course.
- difficulty: EASY, MEDIUM or HARD for a scenario-based practical assessment.
- topics: the list of teaching topics / units.
- learning_outcomes: the stated learning outcomes.
Respond with a single JSON object.
"""

_SEM_RE = re.compile(
    r"\b(?:semester|sem|term)\s*[:\-]?\s*"
    r"(\d{1,2}|i{1,3}v?|vi{0,3}|ix|x|one|two|three|four|five|six|seven|eight)\b",
    re.IGNORECASE,
)


def _find_semester(text: str) -> str:
    m = _SEM_RE.search(text)
    if not m:
        return ""
    return f"Semester {m.group(1).strip().upper()}"


def _fallback(text: str) -> SyllabusAnalysis:
    topics, outcomes = heuristic_structure(text)
    # try to spot a title line and a code token
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    name = next(
        (l for l in lines[:12] if 4 <= len(l) <= 90 and not l.lower().startswith(("unit", "module", "topic"))),
        "Untitled Subject",
    )
    m = re.search(r"\b([A-Z]{2,}[- ]?\d{2,}|\d{6,})\b", text)
    code = m.group(1) if m else re.sub(r"[^A-Za-z]", "", name).upper()[:6] or "SUBJ"
    return SyllabusAnalysis(
        subject_name=name[:200],
        subject_code=code,
        semester=_find_semester(text),
        description=name[:180],
        topics=topics or _keywords(text),
        learning_outcomes=outcomes,
    )


def _keywords(text: str) -> list[str]:
    from collections import Counter

    words = re.findall(r"[A-Za-z][A-Za-z\-]{4,}", text.lower())
    stop = {"students", "course", "shall", "which", "these", "their", "using", "based"}
    return [w.title() for w, _ in Counter(w for w in words if w not in stop).most_common(12)]


def analyze_syllabus(text: str) -> SyllabusAnalysis:
    provider = get_ai_provider()
    if isinstance(provider, MockProvider) or not text.strip():
        return _fallback(text)
    try:
        result = provider.complete_json(
            system=SYSTEM,
            user=f'SYLLABUS TEXT:\n"""\n{text[:14000]}\n"""',
            schema=SyllabusAnalysis,
            max_tokens=1800,
        )
        if not result.semester:
            result.semester = _find_semester(text)
        return result
    except Exception:
        return _fallback(text)
