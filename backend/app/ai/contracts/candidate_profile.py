"""Structured AI output for candidate profile extraction.

Represents the structured data an extractor produces from a candidate resume.
The schema is intentionally minimal and mirrors only terminology already
established in the repository (for example the ``skills`` key used by Phase
3.1 candidate profile fixtures).
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.ai.contracts.schema import AI_CONTRACT_SCHEMA_VERSION, SchemaVersion


class CandidateProfileExtractionOutput(BaseModel):
    """A candidate profile extracted from a resume (schema v1.0)."""

    model_config = ConfigDict(extra="forbid")

    schema_version: SchemaVersion = AI_CONTRACT_SCHEMA_VERSION
    full_name: Annotated[str, Field(min_length=1)]
    summary: str | None = None
    skills: Annotated[list[str], Field(default_factory=list)]
    experience: Annotated[list[str], Field(default_factory=list)]
