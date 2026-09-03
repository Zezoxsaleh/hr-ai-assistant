from app.core.config import Settings


def test_settings_load_with_safe_test_configuration() -> None:
    settings = Settings(
        APP_NAME="Test HR Assistant",
        APP_ENV="test",
        DEBUG=False,
        API_V1_PREFIX="/api/v1",
        DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/test_db",
        TEST_DATABASE_URL="postgresql+psycopg://user:password@localhost:5432/test_db_test",
        STORAGE_ROOT_DIR="./test_storage",
        MAX_UPLOAD_BYTES=1_000_000,
    )

    assert settings.app_name == "Test HR Assistant"
    assert settings.app_env == "test"
    assert settings.debug is False
    assert settings.api_v1_prefix == "/api/v1"
    assert settings.database_url == "postgresql+psycopg://user:password@localhost:5432/test_db"
    assert (
        settings.test_database_url
        == "postgresql+psycopg://user:password@localhost:5432/test_db_test"
    )
    assert settings.storage_root_dir == "./test_storage"
    assert settings.max_upload_bytes == 1_000_000
