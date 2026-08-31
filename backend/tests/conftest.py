import re
from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, Engine, make_url
from sqlalchemy.orm import Session, sessionmaker

from app import models  # noqa: F401
from app.core.config import settings
from app.core.database import Base


def _validated_database_name(url: URL) -> str:
    database_name = url.database
    if database_name is None or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", database_name):
        raise RuntimeError("TEST_DATABASE_URL must include a safe PostgreSQL database name.")
    return database_name


def _ensure_test_database_exists(test_database_url: str) -> None:
    test_url = make_url(test_database_url)
    test_database_name = _validated_database_name(test_url)
    admin_database_name = "postgres" if test_database_name != "postgres" else "template1"
    admin_url = test_url.set(database=admin_database_name)
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)

    try:
        with admin_engine.connect() as connection:
            database_exists = connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :database_name"),
                {"database_name": test_database_name},
            )
            if database_exists is None:
                connection.execute(text(f'CREATE DATABASE "{test_database_name}"'))
    finally:
        admin_engine.dispose()


@pytest.fixture(scope="session")
def test_engine() -> Generator[Engine, None, None]:
    _ensure_test_database_exists(settings.test_database_url)
    engine = create_engine(settings.test_database_url, pool_pre_ping=True)
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    try:
        yield engine
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def db_session(test_engine) -> Generator[Session, None, None]:
    connection = test_engine.connect()
    transaction = connection.begin()
    session_factory = sessionmaker(bind=connection, autoflush=False, autocommit=False)
    session = session_factory()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
