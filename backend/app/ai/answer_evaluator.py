from __future__ import annotations

import hashlib

from app.ai import mock
from app.ai.prompts import ANSWER_EVALUATOR_SYSTEM, PROMPT_VERSIONS
from app.ai.provider import MockProvider, get_eval_provider
from app.ai.schemas import AnswerEvalResult

PROMPT_VERSION = PROMPT_VERSIONS["answer_evaluator"]


def evaluate_answer(
    *,
    common_prompt: str,
    scenario_text: str,
    rubric: list[dict],
    file_inventory: list[str],
    file_contents: dict[str, str],
    deterministic_results: list[dict],
) -> AnswerEvalResult:
    passed = sum(1 for r in deterministic_results if r.get("passed"))
    ratio = passed / len(deterministic_results) if deterministic_results else 0.6
    digest = hashlib.sha256(
        ("".join(sorted(file_inventory)) + "".join(file_contents.values())).encode()
    ).hexdigest()

    provider = get_eval_provider()
    if isinstance(provider, MockProvider):
        return AnswerEvalResult.model_validate(
            mock.mock_answer_eval(rubric=rubric, deterministic_pass_ratio=ratio, submission_digest=digest)
        )

    det = "\n".join(
        f"- [{'PASS' if r['passed'] else 'FAIL'}] {r['name']}: {r.get('explanation', '')}"
        for r in deterministic_results
    )
    # Keep the prompt within a single rate-limit window: cap per file and overall.
    _PER_FILE = 1400
    _TOTAL = 6500
    parts: list[str] = []
    budget = _TOTAL
    for name, content in file_contents.items():
        if budget <= 0:
            parts.append(f"### {name}\n(omitted — prompt size limit)")
            continue
        snippet = content[: min(_PER_FILE, budget)]
        budget -= len(snippet)
        parts.append(f"### {name}\n```\n{snippet}\n```")
    files = "\n\n".join(parts)
    rubric_txt = "\n".join(f"- {c['key']} / {c['name']} (max {c['max_marks']})" for c in rubric)
    user = f"""COMMON QUESTION:
\"\"\"{common_prompt}\"\"\"

STUDENT SCENARIO:
\"\"\"{scenario_text}\"\"\"

RUBRIC (score ONLY these):
{rubric_txt}

DETERMINISTIC TEST RESULTS (ground truth):
{det or "none run"}

SUBMITTED FILES ({len(file_inventory)}): {", ".join(file_inventory)}

FILE CONTENTS:
{files}

Return ONE JSON object with:
  rubric_scores[{{key,name,score,max_score,evidence[]}}], strengths[], weaknesses[],
  recommendations[], explanation, confidence (0-1),
  ai_content_probability (0-1, likelihood the submission was substantially AI-generated),
  ai_content_classification (LOW|MODERATE|HIGH), ai_content_evidence[] (short reasons).
"""
    # gpt-oss models spend part of max_tokens on internal reasoning, so keep headroom.
    return provider.complete_json(
        system=ANSWER_EVALUATOR_SYSTEM, user=user, schema=AnswerEvalResult, max_tokens=3500
    )
