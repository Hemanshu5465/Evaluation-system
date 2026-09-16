from __future__ import annotations

import json
import re
import time
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.core.logging import logger


class AIError(RuntimeError):
    pass


class QuotaExhausted(AIError):
    """The provider's daily / long-window quota is spent — retrying won't help soon."""


def _with_rate_limit_retry(fn, *, label: str):
    """Retry a provider call on a short (per-minute) 429. Fail fast on a daily quota."""
    attempts = settings.AI_RATE_LIMIT_RETRIES + 1
    cap = settings.AI_RATE_LIMIT_MAX_WAIT_S
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # openai.RateLimitError, anthropic.RateLimitError, etc.
            msg = str(e).lower()
            is_rate = "rate limit" in msg or "429" in msg or "too many requests" in msg or e.__class__.__name__ == "RateLimitError"
            if not is_rate:
                raise
            headers = getattr(getattr(e, "response", None), "headers", {}) or {}
            try:
                hinted = float(headers.get("retry-after", 0) or 0)
            except (TypeError, ValueError):
                hinted = 0.0
            should_retry = str(headers.get("x-should-retry", "")).lower() != "false"

            # A large Retry-After (or an explicit "don't retry") means a daily / per-day
            # limit, not the per-minute bucket — sleeping through it is pointless.
            if not should_retry or hinted > cap + 5:
                raise QuotaExhausted(
                    f"{label} quota is exhausted — the model's daily limit was hit. "
                    f"Try again later, switch GROQ_MODEL, or use a paid key."
                ) from e
            if i == attempts - 1:
                raise
            wait = hinted or min(2 ** i, cap)
            logger.warning("%s rate-limited (attempt %s/%s), sleeping %.1fs", label, i + 1, attempts, wait)
            time.sleep(wait)


class AIProvider(ABC):
    name: str = "base"

    @abstractmethod
    def _raw_complete(self, *, system: str, user: str, max_tokens: int) -> str:
        """Return the model's text response."""

    def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema: type[BaseModel],
        max_tokens: int = 4000,
        retries: int | None = None,
    ) -> BaseModel:
        """Call the model, parse JSON, validate against `schema`. Retries on invalid output."""
        attempts = (retries if retries is not None else settings.AI_MAX_RETRIES) + 1
        last_err: Exception | None = None
        reinforce = ""
        for i in range(attempts):
            text = self._raw_complete(
                system=system + JSON_ENFORCE,
                user=user + reinforce,
                max_tokens=max_tokens,
            )
            try:
                data = _extract_json(text)
                return schema.model_validate(data)
            except (ValidationError, ValueError, json.JSONDecodeError) as err:
                last_err = err
                logger.warning("AI output invalid (attempt %s/%s): %s", i + 1, attempts, err)
                reinforce = (
                    "\n\nYour previous response could not be parsed as valid JSON matching the "
                    f"required schema. Error: {err}. Respond again with ONLY valid JSON."
                )
        raise AIError(f"AI provider {self.name} failed to produce valid structured output: {last_err}")


JSON_ENFORCE = (
    "\n\nYou MUST respond with a single valid JSON object and nothing else. "
    "No markdown fences, no prose before or after."
)


def _extract_json(text: str) -> Any:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("no JSON object found in AI response")
        text = text[start : end + 1]
    return json.loads(text)


# --------------------------------------------------------------------------- #
# Anthropic
# --------------------------------------------------------------------------- #
class AnthropicProvider(AIProvider):
    name = "anthropic"

    def __init__(self):
        if not settings.ANTHROPIC_API_KEY:
            raise AIError("ANTHROPIC_API_KEY is not configured.")
        import anthropic

        self._client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY, timeout=settings.AI_TIMEOUT_SECONDS
        )
        self._model = settings.ANTHROPIC_MODEL

    def _raw_complete(self, *, system: str, user: str, max_tokens: int) -> str:
        def call():
            msg = self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return "".join(block.text for block in msg.content if getattr(block, "type", "") == "text")

        return _with_rate_limit_retry(call, label=self.name)


# --------------------------------------------------------------------------- #
# OpenAI-compatible (OpenAI, Groq, and any /v1/chat/completions gateway)
# --------------------------------------------------------------------------- #
class _OpenAICompatibleProvider(AIProvider):
    name = "openai-compatible"

    def __init__(self, *, api_key: str, model: str, base_url: str | None, key_name: str):
        if not api_key:
            raise AIError(f"{key_name} is not configured.")
        from openai import OpenAI

        kwargs: dict = {"api_key": api_key, "timeout": settings.AI_TIMEOUT_SECONDS, "max_retries": 0}
        if base_url:
            kwargs["base_url"] = base_url
        self._client = OpenAI(**kwargs)
        self._model = model

    def _raw_complete(self, *, system: str, user: str, max_tokens: int) -> str:
        def call(json_mode: bool = True):
            kwargs: dict = dict(
                model=self._model,
                max_tokens=max_tokens,
                temperature=0.4,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            resp = self._client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content or ""

        def guarded():
            try:
                return call(json_mode=True)
            except Exception as e:
                # Groq's server-side JSON check can reject a valid-but-truncated
                # generation ("json_validate_failed"). Retry once free-form and
                # let complete_json() extract + validate the object itself.
                if "json_validate_failed" in str(e).lower() or "failed to validate json" in str(e).lower():
                    logger.warning("%s json_validate_failed — retrying without response_format", self.name)
                    return call(json_mode=False)
                raise

        return _with_rate_limit_retry(guarded, label=self.name)


class OpenAIProvider(_OpenAICompatibleProvider):
    name = "openai"

    def __init__(self):
        super().__init__(
            api_key=settings.OPENAI_API_KEY,
            model=settings.OPENAI_MODEL,
            base_url=settings.OPENAI_BASE_URL or None,
            key_name="OPENAI_API_KEY",
        )


class GroqProvider(_OpenAICompatibleProvider):
    name = "groq"

    def __init__(self):
        super().__init__(
            api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
            base_url=settings.GROQ_BASE_URL,
            key_name="GROQ_API_KEY",
        )


# --------------------------------------------------------------------------- #
# Mock (tests / offline dev only). Deterministic, never random.
# --------------------------------------------------------------------------- #
class MockProvider(AIProvider):
    name = "mock"

    def _raw_complete(self, *, system: str, user: str, max_tokens: int) -> str:  # pragma: no cover
        # The mock provider is driven by app.ai.mock which builds deterministic
        # structured payloads. This method should not be reached in normal flow.
        from app.ai.mock import respond

        return json.dumps(respond(system=system, user=user))


_provider: AIProvider | None = None
_eval_provider: AIProvider | None = None


def get_ai_provider() -> AIProvider:
    global _provider
    if _provider is None:
        _provider = {
            "anthropic": AnthropicProvider,
            "openai": OpenAIProvider,
            "groq": GroqProvider,
            "mock": MockProvider,
        }[settings.AI_PROVIDER]()
        logger.info("AI provider initialised: %s", _provider.name)
    return _provider


def get_eval_provider() -> AIProvider:
    """Provider used for answer / project evaluation.

    On Groq this points at a separate model (GROQ_EVAL_MODEL) which has its own
    rate-limit bucket — so a burst of question/scenario generation never delays
    an evaluation, and vice-versa. Everything else falls back to the main provider.
    """
    global _eval_provider
    if _eval_provider is None:
        if settings.AI_PROVIDER == "groq" and settings.GROQ_EVAL_MODEL:
            eval_model = GroqProvider()
            eval_model._model = settings.GROQ_EVAL_MODEL
            eval_model.name = "groq"
            _eval_provider = eval_model
            logger.info("AI eval provider initialised: groq / %s", settings.GROQ_EVAL_MODEL)
        else:
            _eval_provider = get_ai_provider()
    return _eval_provider


def reset_ai_provider() -> None:  # for tests
    global _provider, _eval_provider
    _provider = None
    _eval_provider = None
