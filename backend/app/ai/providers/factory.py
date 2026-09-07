"""Provider factory: selects a concrete ``AIProvider`` from application settings.

``get_provider`` returns ``GeminiProvider`` when ``AI_PROVIDER=gemini`` and a
``GEMINI_API_KEY`` is configured, and falls back to ``FakeAIProvider`` otherwise
so that fresh environments and the test suite keep working without a key.

Keyword arguments are forwarded only to ``FakeAIProvider``; the Gemini branch
ignores them. This preserves the deterministic fake payloads the backend routes
rely on while keeping the real provider path free of domain specifics.
"""

from __future__ import annotations

from app.ai.providers.base import AIProvider
from app.ai.providers.fake import FakeAIProvider
from app.ai.providers.gemini import GeminiProvider
from app.core.config import Settings


def get_provider(settings: Settings, **fake_kwargs) -> AIProvider:
    """Return the AI provider selected by ``settings`` (fake-mode safe)."""
    if settings.ai_provider == "gemini" and settings.gemini_api_key:
        return GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model)
    return FakeAIProvider(**fake_kwargs)
