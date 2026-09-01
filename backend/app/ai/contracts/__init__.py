"""Structured AI output contracts.

Phase 3.2: provider-agnostic, validated data contracts describing what an LLM or
deterministic extractor is expected to produce. Each contract is a plain
Pydantic model (no database behavior, no SQLAlchemy, no HR final decision
fields) validated by helpers that raise the shared application ValidationError.
"""

from app.ai.contracts.candidate_profile import CandidateProfileExtractionOutput
from app.ai.contracts.evaluation import EvaluationExplanationOutput
from app.ai.contracts.job_profile import JobProfileExtractionOutput
from app.ai.contracts.match_evidence import MatchEvidenceOutput
from app.ai.contracts.schema import (
    AI_CONTRACT_SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
)
from app.ai.contracts.validation import (
    validate_candidate_profile_extraction,
    validate_evaluation_explanation,
    validate_job_profile_extraction,
    validate_match_evidence,
)

__all__ = [
    "AI_CONTRACT_SCHEMA_VERSION",
    "CandidateProfileExtractionOutput",
    "EvaluationExplanationOutput",
    "JobProfileExtractionOutput",
    "MatchEvidenceOutput",
    "SUPPORTED_SCHEMA_VERSIONS",
    "validate_candidate_profile_extraction",
    "validate_evaluation_explanation",
    "validate_job_profile_extraction",
    "validate_match_evidence",
]
