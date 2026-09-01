"""Schema versioning for structured AI output contracts.

The initial contract schema version is ``1.0``. Every structured output
contract declares a ``schema_version`` that must be one of the supported
versions below. This boundary lets producers signal which contract revision
they conformed to, and lets consumers reject unrecognized revisions up front.
"""

from typing import Annotated

from pydantic import BeforeValidator, ValidationInfo

AI_CONTRACT_SCHEMA_VERSION = "1.0"

SUPPORTED_SCHEMA_VERSIONS = frozenset({AI_CONTRACT_SCHEMA_VERSION})


def validate_schema_version(value: object, _info: ValidationInfo) -> str:
    """Ensure a schema version is a non-empty string in a known revision."""
    if not isinstance(value, str):
        raise ValueError("schema_version must be a string.")
    version = value.strip()
    if not version:
        raise ValueError("schema_version must not be empty.")
    if version not in SUPPORTED_SCHEMA_VERSIONS:
        raise ValueError(f"Unsupported schema version: {version!r}.")
    return version


SchemaVersion = Annotated[str, BeforeValidator(validate_schema_version)]
