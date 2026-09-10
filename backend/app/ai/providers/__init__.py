"""Provider implementations.

Phase 3.3 ships the deterministic ``FakeAIProvider``; ``SoalProvider`` adds a
real Soal.help adapter via the OpenAI SDK, selected through ``get_provider``.
"""

from app.ai.providers.base import (
    AIProvider,
    StructuredGenerationRequest,
    TextGenerationRequest,
)
from app.ai.providers.errors import (
    ProviderError,
    ProviderInvalidRequestError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
    provider_error_for,
)
from app.ai.providers.factory import get_provider
from app.ai.providers.fake import FakeAIProvider
from app.ai.providers.soal import SoalProvider

__all__ = [
    "AIProvider",
    "FakeAIProvider",
    "SoalProvider",
    "ProviderError",
    "ProviderInvalidRequestError",
    "ProviderRateLimitError",
    "ProviderTimeoutError",
    "ProviderUnavailableError",
    "StructuredGenerationRequest",
    "TextGenerationRequest",
    "get_provider",
    "provider_error_for",
]
