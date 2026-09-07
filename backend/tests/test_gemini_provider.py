"""Hermetic unit tests for the Gemini provider adapter and provider factory.

These tests never make network calls: ``ChatGoogleGenerativeAI`` is replaced
with fakes, and ``db_session`` fixtures are only used to assert that provider
calls never write trace/run rows.
"""

from __future__ import annotations

from unittest import mock

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.contracts import CandidateProfileExtractionOutput, JobProfileExtractionOutput
from app.ai.providers import (
    FakeAIProvider,
    GeminiProvider,
    ProviderInvalidRequestError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    StructuredGenerationRequest,
    TextGenerationRequest,
    get_provider,
)
from app.ai.results import StructuredAIResult, TextAIResult
from app.core.config import Settings
from app.models import AITrace, WorkflowRun, WorkflowStepTrace


class _Message:
    """Minimal stand-in for a LangChain ``AIMessage``."""

    def __init__(self, content, token_usage=None, usage_metadata=None) -> None:
        self.content = content
        self.response_metadata = {"token_usage": token_usage} if token_usage else {}
        self.usage_metadata = usage_metadata


class _FakeLLM:
    """Minimal stand-in for ``langchain_google_genai.ChatGoogleGenerativeAI``."""

    def __init__(self, message=None, exception=None) -> None:
        self._message = message
        self._exception = exception

    def with_structured_output(self, schema, method="json_mode"):
        assert method == "json_mode"
        assert schema is not None
        return self

    def invoke(self, _messages):
        if self._exception is not None:
            raise self._exception
        return self._message


class _HTTPError(Exception):
    """Stand-in vendor error carrying an HTTP status code."""

    def __init__(self, status_code: int, message: str = "provider error") -> None:
        super().__init__(message)
        self.status_code = status_code


def _patch_llm(fake_llm) -> mock._patch:
    return mock.patch(
        "app.ai.providers.gemini.ChatGoogleGenerativeAI",
        return_value=fake_llm,
    )


def _structured_request(schema) -> StructuredGenerationRequest:
    return StructuredGenerationRequest(input="extract candidate profile", output_schema=schema)


def _structured_provider(fake_llm) -> GeminiProvider:
    with _patch_llm(fake_llm):
        return GeminiProvider(api_key="test-key", model="gemini-1.5-flash")


def _count(db: Session, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


# --------------------------------------------------------------------------- #
# Structured generation
# --------------------------------------------------------------------------- #


def test_structured_result_exposes_provider_and_model_with_valid_data() -> None:
    payload = {
        "full_name": "Ada Lovelace",
        "summary": "Mathematician",
        "skills": ["Python"],
        "experience": [],
    }
    json_payload = (
        '{"full_name": "Ada Lovelace", "summary": "Mathematician", '
        '"skills": ["Python"], "experience": []}'
    )
    provider = _structured_provider(_FakeLLM(message=_Message(content=json_payload)))

    result = provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))

    assert isinstance(result, StructuredAIResult)
    assert result.provider == "google"
    assert result.model == "gemini-1.5-flash"
    assert result.data == payload


def test_structured_data_matches_output_schema_when_content_is_dict() -> None:
    payload = {
        "full_name": "Alan Turing",
        "summary": "Enigma breaker",
        "skills": ["Logic"],
        "experience": [],
    }
    provider = _structured_provider(_FakeLLM(message=_Message(content=payload)))

    result = provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))

    assert result.data == payload


def test_structured_with_job_profile_schema() -> None:
    payload = {
        "title": "Backend Engineer",
        "summary": "Builds services",
        "requirements": [{"text": "Python", "category": "must_have", "dimension": "skill"}],
    }
    provider = _structured_provider(_FakeLLM(message=_Message(content=payload)))

    result = provider.generate_structured(_structured_request(JobProfileExtractionOutput))

    assert result.data == payload
    assert result.schema_version == "1.1"


def test_structured_extracts_token_usage_from_response_metadata() -> None:
    usage = {"promptTokenCount": 12, "candidatesTokenCount": 8, "totalTokenCount": 20}
    provider = _structured_provider(
        _FakeLLM(
            message=_Message(
                content={"full_name": "Ada", "summary": "s", "skills": [], "experience": []},
                token_usage=usage,
            )
        )
    )

    result = provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))

    assert result.token_usage == {
        "promptTokenCount": 12,
        "candidatesTokenCount": 8,
        "totalTokenCount": 20,
    }


def test_structured_records_positive_latency() -> None:
    provider = _structured_provider(
        _FakeLLM(
            message=_Message(
                content={"full_name": "Ada", "summary": "s", "skills": [], "experience": []}
            )
        )
    )

    result = provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))

    assert result.latency_ms is not None
    assert result.latency_ms >= 0


def test_structured_without_schema_returns_no_data() -> None:
    provider = _structured_provider(_FakeLLM(message=_Message(content="not structured")))

    result = provider.generate_structured(StructuredGenerationRequest(input="plain"))

    assert result.data is None


# --------------------------------------------------------------------------- #
# Text generation
# --------------------------------------------------------------------------- #


def test_text_result_exposes_provider_model_text_and_usage() -> None:
    usage = {"promptTokenCount": 4, "candidatesTokenCount": 6, "totalTokenCount": 10}
    provider = _structured_provider(
        _FakeLLM(message=_Message(content="short cover letter", token_usage=usage))
    )

    result = provider.generate_text(TextGenerationRequest(input="write a summary"))

    assert isinstance(result, TextAIResult)
    assert result.provider == "google"
    assert result.model == "gemini-1.5-flash"
    assert result.text == "short cover letter"
    assert result.token_usage == {
        "promptTokenCount": 4,
        "candidatesTokenCount": 6,
        "totalTokenCount": 10,
    }


# --------------------------------------------------------------------------- #
# Error mapping
# --------------------------------------------------------------------------- #


def test_timeout_error_is_mapped() -> None:
    provider = _structured_provider(_FakeLLM(exception=TimeoutError("request timed out")))

    with pytest.raises(ProviderTimeoutError):
        provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))


def test_http_timeout_status_is_mapped() -> None:
    provider = _structured_provider(_FakeLLM(exception=_HTTPError(504, "gateway timeout")))

    with pytest.raises(ProviderTimeoutError):
        provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))


def test_rate_limit_error_is_mapped() -> None:
    provider = _structured_provider(_FakeLLM(exception=_HTTPError(429, "resource exhausted")))

    with pytest.raises(ProviderRateLimitError):
        provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))


def test_invalid_request_error_is_mapped() -> None:
    provider = _structured_provider(_FakeLLM(exception=_HTTPError(400, "invalid argument")))

    with pytest.raises(ProviderInvalidRequestError):
        provider.generate_text(TextGenerationRequest(input="boom"))


def test_server_error_is_mapped_to_unavailable() -> None:
    provider = _structured_provider(_FakeLLM(exception=_HTTPError(500, "internal error")))

    with pytest.raises(ProviderUnavailableError):
        provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))


def test_unknown_error_is_mapped_to_unavailable() -> None:
    provider = _structured_provider(_FakeLLM(exception=RuntimeError("mystery failure")))

    with pytest.raises(ProviderUnavailableError):
        provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))


# --------------------------------------------------------------------------- #
# Persistence boundaries
# --------------------------------------------------------------------------- #


def test_structured_generation_writes_no_db_rows(db_session: Session) -> None:
    provider = _structured_provider(
        _FakeLLM(
            message=_Message(
                content={"full_name": "Ada", "summary": "s", "skills": [], "experience": []}
            )
        )
    )

    provider.generate_structured(_structured_request(CandidateProfileExtractionOutput))

    assert _count(db_session, WorkflowRun) == 0
    assert _count(db_session, WorkflowStepTrace) == 0
    assert _count(db_session, AITrace) == 0


def test_text_generation_writes_no_db_rows(db_session: Session) -> None:
    provider = _structured_provider(_FakeLLM(message=_Message(content="hello")))

    provider.generate_text(TextGenerationRequest(input="hi"))

    assert _count(db_session, WorkflowRun) == 0
    assert _count(db_session, WorkflowStepTrace) == 0
    assert _count(db_session, AITrace) == 0


# --------------------------------------------------------------------------- #
# Provider factory
# --------------------------------------------------------------------------- #


def test_factory_returns_gemini_with_key() -> None:
    settings = Settings(
        ai_provider="gemini", gemini_api_key="secret", gemini_model="gemini-1.5-flash"
    )
    with mock.patch(
        "app.ai.providers.gemini.ChatGoogleGenerativeAI",
        return_value=_FakeLLM(),
    ):
        provider = get_provider(settings)

    assert isinstance(provider, GeminiProvider)
    assert provider.model_name == "gemini-1.5-flash"


def test_factory_returns_fake_in_fake_mode() -> None:
    settings = Settings(ai_provider="fake", gemini_api_key="secret")

    provider = get_provider(settings, provider="fake", model="fake-model")

    assert isinstance(provider, FakeAIProvider)


def test_factory_falls_back_to_fake_when_key_missing() -> None:
    settings = Settings(ai_provider="gemini", gemini_api_key=None)

    provider = get_provider(settings)

    assert isinstance(provider, FakeAIProvider)


def test_factory_forwards_kwargs_only_to_fake() -> None:
    settings = Settings(ai_provider="fake")
    payload = {"full_name": "Ada", "summary": "s", "skills": [], "experience": []}

    provider = get_provider(settings, structured_payload=payload)

    assert isinstance(provider, FakeAIProvider)
    result = provider.generate_structured(
        StructuredGenerationRequest(input="x", output_schema=CandidateProfileExtractionOutput)
    )
    assert result.data == payload
