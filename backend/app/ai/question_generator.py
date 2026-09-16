from __future__ import annotations

from app.ai import mock
from app.ai.prompts import PROMPT_VERSIONS, QUESTION_GENERATOR_SYSTEM
from app.ai.provider import MockProvider, get_ai_provider
from app.ai.schemas import QuestionGenResult

PROMPT_VERSION = PROMPT_VERSIONS["question_generator"]

_DIFFICULTY_GUIDANCE = {
    "EASY": (
        "Keep this introductory and straightforward: one well-known concept at a time, generous guidance, "
        "minimal edge cases. A student who studied the material should comfortably get most parts fully correct."
    ),
    "MEDIUM": (
        "Require applying more than one concept together and some independent judgement, but avoid deliberately "
        "tricky traps — a solid, prepared student should be able to work through it without getting stuck."
    ),
    "HARD": (
        "Make this genuinely challenging: combine multiple concepts, include realistic edge cases and constraints "
        "that must be reasoned about carefully, and require real design or implementation trade-offs rather than "
        "recalling a standard textbook pattern."
    ),
    "ADVANCED": (
        "This is the HARDEST tier — make the question deliberately advanced and twisted, not just longer. "
        "Combine several concepts from the syllabus so they interact in a non-obvious way. Include subtle edge "
        "cases and constraints that conflict with each other unless handled correctly. Phrase at least one part "
        "so it cannot be solved by pattern-matching a standard textbook example — it must require multi-step "
        "reasoning, careful reading, and synthesising ideas across the syllabus to get right. Push students to "
        "genuinely think hard, check edge cases, and justify their design choices. Stay within the given scope "
        "and keep it fair and well-specified — advanced and twisted, never vague, unfair, or outside the material."
    ),
}


def generate_question(
    *,
    subject_name: str,
    syllabus_title: str,
    syllabus_topics: list[str],
    learning_outcomes: list[str],
    extracted_text: str,
    difficulty: str,
    selected_topics: list[str],
    number_of_parts: int,
    class_coverage: str | None = None,
) -> QuestionGenResult:
    provider = get_ai_provider()
    if isinstance(provider, MockProvider):
        return QuestionGenResult.model_validate(
            mock.mock_question(
                subject_name=subject_name,
                topics=selected_topics or syllabus_topics,
                difficulty=difficulty,
                number_of_parts=number_of_parts,
            )
        )

    class_coverage = (class_coverage or "").strip()
    if class_coverage:
        # Admin gave the actual topics/questions covered in class — treat that as
        # the ONLY source, ignoring the wider syllabus, so the question stays
        # solvable by students at the level they were actually taught.
        source_label = "MATERIAL ACTUALLY COVERED IN CLASS (the ONLY source you may draw from)"
        source_text = class_coverage[:12000]
        scope_note = (
            "\nSTRICT SCOPE RULE: Base the question ONLY on the material covered in class above. "
            "Do not introduce topics, techniques, algorithms, or difficulty beyond what is listed there, "
            "even if the wider syllabus below covers more advanced material. If the class-covered material "
            "is a list of topics, write original questions about those topics; if it already contains example "
            "questions, use them as the model for style and depth.\n"
        )
    else:
        source_label = "SYLLABUS CONTENT (verbatim extract, use as the authoritative source)"
        source_text = extracted_text[:12000]
        scope_note = ""

    difficulty_note = _DIFFICULTY_GUIDANCE.get(difficulty.upper(), _DIFFICULTY_GUIDANCE["MEDIUM"])

    user = f"""SUBJECT: {subject_name}
SYLLABUS TITLE: {syllabus_title}
SYLLABUS TOPICS: {", ".join(syllabus_topics)}
LEARNING OUTCOMES: {"; ".join(learning_outcomes)}
TARGET TOPICS FOR THIS QUESTION: {", ".join(selected_topics) or "instructor's discretion"}
DIFFICULTY: {difficulty}
DIFFICULTY GUIDANCE (follow this closely — it determines how hard the question actually is): {difficulty_note}
NUMBER OF PARTS: {number_of_parts}
{scope_note}
{source_label}:
\"\"\"
{source_text}
\"\"\"

Return JSON with keys: title, common_prompt, parts[{{part_number, prompt, expected_concept, marks}}],
instructions[], constraints[], expected_files[], learning_objectives[], difficulty,
evaluation_rubric[{{key, name, max_marks}}]. The rubric max_marks MUST sum to 100.
"""
    return provider.complete_json(
        system=QUESTION_GENERATOR_SYSTEM, user=user, schema=QuestionGenResult, max_tokens=3400
    )
