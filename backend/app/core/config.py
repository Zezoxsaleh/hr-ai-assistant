from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="AI HR Recruitment Assistant", validation_alias="APP_NAME")
    app_env: str = Field(default="development", validation_alias="APP_ENV")
    debug: bool = Field(default=False, validation_alias="DEBUG")
    api_v1_prefix: str = Field(default="/api/v1", validation_alias="API_V1_PREFIX")
    database_url: str = Field(
        default="postgresql+psycopg://hr_ai_assistant:hr_ai_assistant@localhost:5432/hr_ai_assistant",
        validation_alias="DATABASE_URL",
    )
    test_database_url: str = Field(
        default="postgresql+psycopg://hr_ai_assistant:hr_ai_assistant@localhost:5432/hr_ai_assistant_test",
        validation_alias="TEST_DATABASE_URL",
    )
    storage_root_dir: str = Field(default="./storage", validation_alias="STORAGE_ROOT_DIR")
    max_upload_bytes: int = Field(default=5_000_000, validation_alias="MAX_UPLOAD_BYTES")
    cors_allow_origins: list[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"],
        validation_alias="CORS_ALLOW_ORIGINS",
    )
    cors_allow_methods: Literal["*"] | list[str] = Field(
        default=["GET", "POST", "PATCH", "DELETE"],
        validation_alias="CORS_ALLOW_METHODS",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
