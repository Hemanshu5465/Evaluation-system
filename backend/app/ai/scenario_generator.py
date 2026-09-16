from __future__ import annotations

import hashlib
import json

from app.ai import mock
from app.ai.prompts import PROMPT_VERSIONS, SCENARIO_GENERATOR_SYSTEM
from app.ai.provider import MockProvider, get_ai_provider
from app.ai.schemas import ScenarioGenResult

PROMPT_VERSION = PROMPT_VERSIONS["scenario_generator"]


def scenario_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def generate_scenario(
    *,
    common_prompt: str,
    learning_objectives: list[str],
    difficulty: str,
    assessment_key: str,
    student_key: str,
    used_domains: list[str],
) -> ScenarioGenResult:
    provider = get_ai_provider()
    if isinstance(provider, MockProvider):
        return ScenarioGenResult.model_validate(
            mock.mock_scenario(
                common_prompt=common_prompt,
                student_key=student_key,
                assessment_key=assessment_key,
            )
        )

    user = f"""COMMON QUESTION (shared by all students, do not change its intent):
\"\"\"
{common_prompt}
\"\"\"
LEARNING OBJECTIVES (must remain equivalent): {"; ".join(learning_objectives)}
DIFFICULTY (must remain equivalent): {difficulty}
DOMAINS ALREADY ASSIGNED TO OTHER STUDENTS (avoid these): {", ".join(used_domains) or "none"}
STUDENT SCENARIO SEED: {student_key}

Produce a distinct business scenario. Return JSON with keys:
title, domain, scenario_text, entities[{{name, columns[]}}], sample_records_note, variables{{}}.
"""
    return provider.complete_json(
        system=SCENARIO_GENERATOR_SYSTEM, user=user, schema=ScenarioGenResult, max_tokens=2200
    )
