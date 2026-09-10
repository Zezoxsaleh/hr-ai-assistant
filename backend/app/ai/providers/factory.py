"""Provider factory: selects a concrete ``AIProvider`` from application settings.

``get_provider`` returns ``SoalProvider`` when ``AI_PROVIDER=soal`` and a
``SOAL_API_KEY`` is configured, and falls back to ``FakeAIProvider`` otherwise
so that fresh environments and the test suite keep working without a key.

A runtime API key override (see ``app.core.runtime_config``) takes precedence
over the ``SOAL_API_KEY`` env var and implicitly enables the Soal provider
even when ``AI_PROVIDER`` is unset — this is how the app surfaces Soal live in
dev/demo mode without a server restart.

Keyword arguments are forwarded only to ``FakeAIProvider``; the Soal branch
ignores them. This preserves the deterministic fake payloads the backend routes
rely on while keeping the real provider path free of domain specifics.
"""

from __future__ import annotations

from app.ai.providers.base import AIProvider
from app.ai.providers.fake import FakeAIProvider
from app.ai.providers.soal import SoalProvider
from app.core.config import Settings
from app.core.runtime_config import get_api_key as runtime_api_key

API_KEY_SOURCE_NONE = "none"
API_KEY_SOURCE_ENVIRONMENT = "environment"
API_KEY_SOURCE_RUNTIME = "runtime"


def resolve_ai_config(settings: Settings) -> dict:
    """Return the effective provider config as a dict.

    Keys:
    - ``provider``: "soal" or "fake"
    - ``model``: the active model ("" when fake)
    - ``base_url``: the active endpoint ("" when fake/soal-with-default)
    - ``api_key``: the active API key ("" when none)
    - ``api_key_source``: "runtime", "environment" or "none"
    - ``is_fake``: True only when the deterministic fake provider is active
    """
    runtime_key = runtime_api_key()
    api_key = runtime_key or settings.soal_api_key
    use_soal = settings.ai_provider == "soal" or runtime_key is not None
    if not use_soal or not api_key:
        return {
            "provider": "fake",
            "model": "",
            "base_url": "",
            "api_key": "",
            "api_key_source": API_KEY_SOURCE_NONE,
            "is_fake": True,
        }
    source = API_KEY_SOURCE_RUNTIME if runtime_key else API_KEY_SOURCE_ENVIRONMENT
    return {
        "provider": "soal",
        "model": settings.soal_model,
        "base_url": settings.soal_base_url,
        "api_key": api_key,
        "api_key_source": source,
        "is_fake": False,
    }


def get_provider(settings: Settings, **fake_kwargs) -> AIProvider:
    """Return the AI provider selected by ``settings`` (fake-mode safe)."""
    config = resolve_ai_config(settings)
    if config["provider"] == "soal":
        return SoalProvider(
            api_key=config["api_key"],
            model=config["model"],
            base_url=config["base_url"],
        )
    return FakeAIProvider(**fake_kwargs)
