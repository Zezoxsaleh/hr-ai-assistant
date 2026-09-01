"""Structured AI output for matching evidence.

Represents a single piece of matching evidence connecting a candidate to a
specific job requirement. Evidence is explicitly non-decisional: this contract
must NOT produce or imply an HR decision, a final score, or any authorization
outcome. Only the evidence fields mirroring the ``MatchEvidence`` model (and
its documented ``evidence_type`` constraint) are included.
"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from app.ai.contracts.schema import AI_CONTRACT_SCHEMA_VERSION, SchemaVersion


class MatchEvidenceOutput(BaseModel):
    """A single matching evidence item for a candidate evaluation (schema v1.0)."""

    model_config = ConfigDict(extra="forbid")

    schema_version: SchemaVersion = AI_CONTRACT_SCHEMA_VERSION
    evidence_type: Literal["matched", "missing", "partial"]
    requirement_ref: dict[str, Any] | None = None
    candidate_evidence: dict[str, Any] | None = None
    strength: str | None = None
    provenance: dict[str, Any] | None = None
