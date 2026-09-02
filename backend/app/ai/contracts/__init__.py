"""Structured AI output contracts.

Phase 3.2: provider-agnostic, validated data contracts describing what an LLM or
deterministic extractor is expected to produce. Each contract is a plain
Pydantic model (no database behavior, no SQLAlchemy, no HR final decision
fields) validated by helpers that raise the shared application ValidationError.
"""

from app.ai.contracts.candidate_profile import CandidateProfileExtractionOutput
from app.ai.contracts.evaluation import EvaluationExplanationOutput
from app.ai.contracts.job_profile import (
    REQUIREMENT_CATEGORIES,
    REQUIREMENT_DIMENSIONS,
    JobProfileExtractionOutput,
    JobRequirement,
    requirement_key,
)
from app.ai.contracts.match_evidence import (
    EVIDENCE_CONTRACT_SCHEMA_VERSION,
    MatchEvidenceListOutput,
    MatchEvidenceOutput,
    is_requirement_key,
)
from app.ai.contracts.schema import (
    AI_CONTRACT_SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
)
from app.ai.contracts.validation import (
    normalize_job_profile_requirements,
    validate_candidate_profile_extraction,
    validate_evaluation_explanation,
    validate_job_profile_extraction,
    validate_match_evidence,
    validate_match_evidence_list,
)

__all__ = [
    "AI_CONTRACT_SCHEMA_VERSION",
    "CandidateProfileExtractionOutput",
    "EVIDENCE_CONTRACT_SCHEMA_VERSION",
    "EvaluationExplanationOutput",
    "JobProfileExtractionOutput",
    "JobRequirement",
    "MatchEvidenceListOutput",
    "MatchEvidenceOutput",
    "REQUIREMENT_CATEGORIES",
    "REQUIREMENT_DIMENSIONS",
    "SUPPORTED_SCHEMA_VERSIONS",
    "is_requirement_key",
    "normalize_job_profile_requirements",
    "requirement_key",
    "validate_candidate_profile_extraction",
    "validate_evaluation_explanation",
    "validate_job_profile_extraction",
    "validate_match_evidence",
    "validate_match_evidence_list",
]
