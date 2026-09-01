"""Structured AI output for job profile extraction.

Represents the structured data an extractor produces from a raw job
description. The schema is intentionally minimal: it captures only fields
already justified by the repository so far, and stores richer detail under
explicitly typed fields rather than a speculative nested structure.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.ai.contracts.schema import AI_CONTRACT_SCHEMA_VERSION, SchemaVersion


class JobProfileExtractionOutput(BaseModel):
    """A job profile extracted from a raw job description (schema v1.0)."""

    model_config = ConfigDict(extra="forbid")

    schema_version: SchemaVersion = AI_CONTRACT_SCHEMA_VERSION
    title: Annotated[str, Field(min_length=1)]
    summary: str | None = None
    requirements: Annotated[list[str], Field(default_factory=list)]
