"""Google Gemini provider adapter implemented via LangChain.

This adapter implements the provider-independent ``AIProvider`` interface only.
It performs no domain work, does not touch the database, and has no knowledge of
workflows, traces, or resume parsing. Errors are mapped onto the provider error
hierarchy in ``app.ai.providers.errors``.
"""

from __future__ import annotations

import json
import time
from typing import Any

from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from app.ai.providers.base import AIProvider, StructuredGenerationRequest, TextGenerationRequest
from app.ai.providers.errors import (
    ProviderError,
    ProviderInvalidRequestError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)
from app.ai.results import StructuredAIResult, TextAIResult


class GeminiProvider(AIProvider):
    """Adapter around ``ChatGoogleGenerativeAI`` for Gemini structured and text generation."""

    provider_name = "google"

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        self.api_key = api_key
        self.model_name = model
        self._llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=api_key,
            timeout=60,
            max_retries=1,
        )

    def generate_structured(self, request: StructuredGenerationRequest) -> StructuredAIResult:
        started = time.monotonic()
        try:
            if request.output_schema is not None:
                payload = self._llm.with_structured_output(
                    request.output_schema, method="json_mode"
                ).invoke([("human", request.input)])
            else:
                payload = self._llm.invoke([("human", request.input)])
        except ProviderError:
            raise
        except Exception as error:  # noqa: BLE001 - normalize vendor/network failures
            mapped = _map_exception(error)
            if mapped is not None:
                raise mapped from error
            raise ProviderUnavailableError(str(error)) from error

        elapsed_ms = int((time.monotonic() - started) * 1000)
        data = None if request.output_schema is None else _extract_dict(payload)
        return StructuredAIResult(
            provider=self.provider_name,
            model=self.model_name,
            token_usage=_extract_token_usage(payload),
            latency_ms=elapsed_ms,
            data=data,
            schema_version=request.schema_version,
        )

    def generate_text(self, request: TextGenerationRequest) -> TextAIResult:
        started = time.monotonic()
        try:
            payload = self._llm.invoke([("human", request.input)])
        except ProviderError:
            raise
        except Exception as error:  # noqa: BLE001 - normalize vendor/network failures
            mapped = _map_exception(error)
            if mapped is not None:
                raise mapped from error
            raise ProviderUnavailableError(str(error)) from error

        elapsed_ms = int((time.monotonic() - started) * 1000)
        return TextAIResult(
            provider=self.provider_name,
            model=self.model_name,
            token_usage=_extract_token_usage(payload),
            latency_ms=elapsed_ms,
            text=str(payload.content),
        )


def _extract_dict(payload: Any) -> dict[str, Any] | None:
    """Return structured ``data`` as a plain dict from a LangChain response object.

    Handles the shapes returned by ``with_structured_output`` across LangChain
    versions: ``content`` as JSON string, dict, or Pydantic model; ``parsed`` as
    dict or Pydantic model; or the payload itself being a dict.
    """
    if isinstance(payload, dict):
        return dict(payload)

    content = getattr(payload, "content", None)
    if isinstance(content, dict):
        return dict(content)
    if isinstance(content, BaseModel):
        return content.model_dump()
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
        except (TypeError, ValueError):
            return None
        if isinstance(parsed, dict):
            return dict(parsed)
        return None

    parsed = getattr(payload, "parsed", None)
    if isinstance(parsed, dict):
        return dict(parsed)
    if isinstance(parsed, BaseModel):
        return parsed.model_dump()
    return None


def _extract_token_usage(payload: Any) -> dict[str, int] | None:
    metadata = getattr(payload, "response_metadata", None) or {}
    usage = metadata.get("token_usage")
    if isinstance(usage, dict):
        return {str(k): int(v) for k, v in usage.items() if isinstance(v, int)}

    usage_metadata = getattr(payload, "usage_metadata", None)
    if usage_metadata:
        return {str(k): int(v) for k, v in usage_metadata.items() if isinstance(v, int)}
    return None


def _map_exception(error: Exception) -> ProviderError | None:
    """Best-effort mapping of vendor exceptions onto the provider error hierarchy."""
    code = None
    for attr in ("status_code", "code", "grpc_status"):
        candidate = getattr(error, attr, None)
        if candidate is not None and (isinstance(candidate, int) and candidate > 0):
            code = candidate
            break

    if code is not None:
        if code == 408 or code == 504:
            return ProviderTimeoutError(str(error))
        if code == 429:
            return ProviderRateLimitError(str(error))
        if code in (400, 401, 403, 404, 422):
            return ProviderInvalidRequestError(str(error))
        return ProviderUnavailableError(str(error))

    message = str(error).lower()
    error_type = type(error).__name__.lower()

    if any(term in message or term in error_type for term in ("timeout", "deadline exceeded")):
        return ProviderTimeoutError(str(error))
    if any(term in message or term in error_type for term in ("rate limit", "resource exhausted")):
        return ProviderRateLimitError(str(error))
    if any(
        term in message or term in error_type
        for term in ("invalid argument", "invalid request", "bad request")
    ):
        return ProviderInvalidRequestError(str(error))
    if any(
        term in message or term in error_type
        for term in (
            "unauthorized",
            "permission denied",
            "not found",
            "connection",
            "unavailable",
            "internal error",
        )
    ):
        return ProviderUnavailableError(str(error))
    return None
