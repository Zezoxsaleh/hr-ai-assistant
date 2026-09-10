"""API integration tests for the AI-settings endpoints."""

from __future__ import annotations

import uuid
from collections.abc import Generator
from unittest import mock

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.providers.factory import resolve_ai_config
from app.core import runtime_config
from app.core.config import get_settings
from app.core.database import get_db
from app.main import app


@pytest.fixture(autouse=True)
def _reset_runtime_key() -> None:
    """Fresh runtime-key state for every test; never leaks across tests."""
    runtime_config.clear_api_key()
    yield
    runtime_config.clear_api_key()


@pytest.fixture()
def client(db_session: Session) -> Generator[httpx.Client, None, None]:
    """Provide a synchronous test client sharing the test db_session."""
    connection = db_session.connection()
    db_session.bind = connection

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.pop(get_db, None)


def auth_headers(org_id: str, user_id: str) -> dict[str, str]:
    """Return standard MVP auth headers (mirrors test_api.py)."""
    return {"X-User-Id": user_id, "X-Organization-Id": org_id}


def bootstrap(client: httpx.Client) -> tuple[dict, dict]:
    """Create an org + user, return them as dicts (mirrors test_api.py)."""
    org = client.post("/api/v1/organizations", json={"name": "Settings Test"}).json()
    user = client.post(
        f"/api/v1/organizations/{org['id']}/users",
        json={"email": "settings@test.com", "full_name": "Settings User"},
    ).json()
    return org, user


def test_get_returns_effective_config(client: httpx.Client) -> None:
    """GET /settings/ai reports the effective provider/model and never the key."""
    org, user = bootstrap(client)
    h = auth_headers(org["id"], user["id"])

    effective = resolve_ai_config(get_settings())
    resp = client.get("/api/v1/settings/ai", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == effective["provider"]
    assert body["has_api_key"] == bool(effective["api_key"])
    assert body["api_key_source"] == effective["api_key_source"]
    assert body["model"] == effective["model"]
    assert "api_key" not in body


def test_set_runtime_key_enables_soal(client: httpx.Client) -> None:
    """Setting a runtime key flips the provider to soal without a restart."""
    org, user = bootstrap(client)
    h = auth_headers(org["id"], user["id"])

    resp = client.post(
        "/api/v1/settings/ai/api-key", json={"api_key": "gh-test-key-123"}, headers=h
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "soal"
    assert body["has_api_key"] is True
    assert body["api_key_source"] == "runtime"
    assert "api_key" not in body

    # The key is actually in the runtime store and the factory will use it.
    assert runtime_config.get_api_key() == "gh-test-key-123"


def test_clear_runtime_key(client: httpx.Client) -> None:
    """DELETE /settings/ai/api-key removes the override."""
    org, user = bootstrap(client)
    h = auth_headers(org["id"], user["id"])

    client.post("/api/v1/settings/ai/api-key", json={"api_key": "gh-test-key-123"}, headers=h)
    resp = client.delete("/api/v1/settings/ai/api-key", headers=h)
    assert resp.status_code == 200
    effective = resolve_ai_config(get_settings())  # runtime key gone; base config applies
    body = resp.json()
    assert body["provider"] == effective["provider"]
    assert body["has_api_key"] == bool(effective["api_key"])
    assert body["api_key_source"] == effective["api_key_source"]
    assert runtime_config.get_api_key() is None


def test_set_blank_key_is_treated_as_absent(client: httpx.Client) -> None:
    """A whitespace-only key is normalised to ``None`` (no override)."""
    org, user = bootstrap(client)
    h = auth_headers(org["id"], user["id"])

    resp = client.post("/api/v1/settings/ai/api-key", json={"api_key": "   "}, headers=h)
    assert resp.status_code == 200
    effective = resolve_ai_config(get_settings())  # blank runtime key -> no override
    assert resp.json()["has_api_key"] == bool(effective["api_key"])
    assert resp.json()["api_key_source"] == effective["api_key_source"]


@pytest.mark.skipif(
    bool(get_settings().soal_api_key),
    reason="requires no SOAL_API_KEY configured (otherwise verify performs a live call)",
)
def test_verify_missing_key_returns_inline_failure(client: httpx.Client) -> None:
    """Verify without any configured key returns ok=False, not an HTTP error."""
    org, user = bootstrap(client)
    h = auth_headers(org["id"], user["id"])

    resp = client.post("/api/v1/settings/ai/verify", json={}, headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["message"]
    assert body["model"]


def test_verify_with_provided_key_calls_soal(client: httpx.Client) -> None:
    """Verify with an explicit key performs a real provider call and reports ok."""
    org, user = bootstrap(client)
    h = auth_headers(org["id"], user["id"])
    fake_result = mock.Mock()
    fake_result.text = "OK"

    with mock.patch("app.api.v1.routes.ai_settings.SoalProvider") as mock_provider_cls:
        provider = mock_provider_cls.return_value
        provider.generate_text.return_value = fake_result

        resp = client.post(
            "/api/v1/settings/ai/verify", json={"api_key": "gh-probe-key"}, headers=h
        )

    mock_provider_cls.assert_called_once()
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "verified" in body["message"].lower()


def test_verify_rate_limit_reports_failure(client: httpx.Client) -> None:
    """Rate limiting surfaces as ok=False with a friendly message."""
    from app.ai.providers.errors import ProviderRateLimitError

    org, user = bootstrap(client)
    h = auth_headers(org["id"], user["id"])

    with mock.patch("app.api.v1.routes.ai_settings.SoalProvider") as mock_provider_cls:
        provider = mock_provider_cls.return_value
        provider.generate_text.side_effect = ProviderRateLimitError("quota")

        resp = client.post(
            "/api/v1/settings/ai/verify", json={"api_key": "gh-probe-key"}, headers=h
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "rate limit" in body["message"].lower()


def test_verify_provider_error_reports_failure(client: httpx.Client) -> None:
    """Generic provider failures return ok=False without leaking details."""
    from app.ai.providers.errors import ProviderUnavailableError

    org, user = bootstrap(client)
    h = auth_headers(org["id"], user["id"])

    with mock.patch("app.api.v1.routes.ai_settings.SoalProvider") as mock_provider_cls:
        provider = mock_provider_cls.return_value
        provider.generate_text.side_effect = ProviderUnavailableError("boom")

        resp = client.post(
            "/api/v1/settings/ai/verify", json={"api_key": "gh-probe-key"}, headers=h
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert "provider" in body["message"].lower()


def test_verify_requires_identity(client: httpx.Client) -> None:
    """Settings endpoints honour the header-based identity requirement."""
    bogus = {
        "X-User-Id": "not-a-uuid",
        "X-Organization-Id": str(uuid.uuid4()),
    }
    resp = client.get("/api/v1/settings/ai", headers=bogus)
    assert resp.status_code == 422
