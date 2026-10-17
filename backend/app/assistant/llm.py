"""Thin Groq client (OpenAI-compatible chat completions; plan T-8, decision D-02).
The one place that knows the provider; swap this file to change it."""

import json
import logging
import time

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

API = "https://api.groq.com/openai/v1/chat/completions"
RETRY_STATUSES = {429, 500, 502, 503, 504}


class LLMError(Exception):
    """Any failure to get usable JSON from the provider. Callers fall back to templates (plan §12 Path F)."""


class LLMRefusal(LLMError):
    """The model declined in plain text instead of JSON (Groq `json_validate_failed`), e.g. on unsafe requests."""


def _is_json_refusal(r: httpx.Response) -> bool:
    try:
        return r.status_code == 400 and r.json()["error"]["code"] == "json_validate_failed"
    except (ValueError, KeyError, TypeError):
        return False


def configured() -> bool:
    s = get_settings()
    return bool(s.LLM_API_KEY and s.LLM_MODEL) and not s.LLM_FORCE_FAIL


def model_name() -> str:
    return get_settings().LLM_MODEL


def generate_json(system: str, user: str) -> dict:
    """One JSON object from the model. One retry on rate limits, server errors and timeouts."""
    s = get_settings()
    if not configured():
        raise LLMError("LLM not configured")
    body = {
        "model": s.LLM_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        # JSON object mode works across Groq models; the shape is in the prompt and enforced by Pydantic.
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_completion_tokens": 2048,
    }
    headers = {"Authorization": f"Bearer {s.LLM_API_KEY}"}
    deadline = time.monotonic() + s.LLM_TIMEOUT_S
    for attempt in (1, 2):
        try:
            r = httpx.post(API, json=body, headers=headers, timeout=max(1.0, deadline - time.monotonic()))
        except httpx.TimeoutException as e:
            if attempt == 2 or deadline - time.monotonic() < 3:
                raise LLMError("LLM timed out") from e
            time.sleep(2)
            continue
        except httpx.HTTPError as e:
            raise LLMError(f"LLM request failed: {type(e).__name__}") from e
        if r.status_code in RETRY_STATUSES and attempt == 1 and deadline - time.monotonic() > 3:
            time.sleep(2)
            continue
        if _is_json_refusal(r):
            if attempt == 1:  # often a one-off; the second try usually returns valid JSON
                continue
            raise LLMRefusal("model declined in plain text")
        if r.status_code != 200:
            raise LLMError(f"LLM HTTP {r.status_code}")
        try:
            return json.loads(r.json()["choices"][0]["message"]["content"])
        except (KeyError, IndexError, ValueError, TypeError) as e:
            raise LLMError("LLM reply was not the expected JSON") from e
    raise LLMError("LLM retries exhausted")
