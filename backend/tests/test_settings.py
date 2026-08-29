from app.core.config import Settings


def test_settings_load_with_safe_test_configuration() -> None:
    settings = Settings(
        APP_NAME="Test HR Assistant",
        APP_ENV="test",
        DEBUG=False,
        API_V1_PREFIX="/api/v1",
        DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/test_db",
    )

    assert settings.app_name == "Test HR Assistant"
    assert settings.app_env == "test"
    assert settings.debug is False
    assert settings.api_v1_prefix == "/api/v1"
    assert settings.database_url == "postgresql+psycopg://user:password@localhost:5432/test_db"
