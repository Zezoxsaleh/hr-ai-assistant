"""Provider implementations.

Phase 3.3 ships only the deterministic ``FakeAIProvider``; real provider
adapters are intentionally deferred to a later phase.
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
from app.ai.providers.fake import FakeAIProvider

__all__ = [
    "AIProvider",
    "FakeAIProvider",
    "ProviderError",
    "ProviderInvalidRequestError",
    "ProviderRateLimitError",
    "ProviderTimeoutError",
    "ProviderUnavailableError",
    "StructuredGenerationRequest",
    "TextGenerationRequest",
    "provider_error_for",
]
