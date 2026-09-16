from __future__ import annotations

from app.ai import mock
from app.ai.prompts import AI_CONTENT_DETECTOR_SYSTEM, PROMPT_VERSIONS
from app.ai.provider import MockProvider, get_ai_provider
from app.ai.schemas import AIContentResult

PROMPT_VERSION = PROMPT_VERSIONS["ai_content_detector"]


def detect_ai_content(*, text: str) -> AIContentResult:
    """Estimate AI-generated-content probability. PROBABILISTIC INDICATOR ONLY."""
    provider = get_ai_provider()
    if isinstance(provider, MockProvider):
        return AIContentResult.model_validate(mock.mock_ai_content(text=text))

    user = (
        "Estimate the probability the following submission text was substantially AI-generated. "
        "Return JSON: estimated_probability (0-1), classification (LOW|MODERATE|HIGH), "
        "confidence (0-1), evidence[].\n\n"
        f'SUBMISSION TEXT:\n"""\n{text[:5000]}\n"""'
    )
    return provider.complete_json(
        system=AI_CONTENT_DETECTOR_SYSTEM, user=user, schema=AIContentResult, max_tokens=700
    )
