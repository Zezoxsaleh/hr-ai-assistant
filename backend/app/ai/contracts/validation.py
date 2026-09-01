"""Validation helpers for structured AI output contracts.

Each helper accepts structured Python data, validates it through Pydantic, and
returns the validated contract instance. On failure a Pydantic ``ValidationError``
is translated into the Phase 3.1 application ``ValidationError`` so callers can
rely on a single error hierarchy. These helpers never persist anything and never
call an external provider.
"""

from typing import Any, TypeVar

from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from app.ai.contracts.candidate_profile import CandidateProfileExtractionOutput
from app.ai.contracts.evaluation import EvaluationExplanationOutput
from app.ai.contracts.job_profile import JobProfileExtractionOutput
from app.ai.contracts.match_evidence import MatchEvidenceOutput
from app.services.errors import ValidationError

T = TypeVar("T", bound=BaseModel)


def _validate_contract(contract_type: type[T], data: Any) -> T:
    try:
        return contract_type.model_validate(data)
    except PydanticValidationError as error:
        raise ValidationError(f"Invalid AI output contract: {error}") from error


def validate_job_profile_extraction(data: Any) -> JobProfileExtractionOutput:
    """Validate raw extraction data into a JobProfileExtractionOutput."""
    return _validate_contract(JobProfileExtractionOutput, data)


def validate_candidate_profile_extraction(data: Any) -> CandidateProfileExtractionOutput:
    """Validate raw extraction data into a CandidateProfileExtractionOutput."""
    return _validate_contract(CandidateProfileExtractionOutput, data)


def validate_match_evidence(data: Any) -> MatchEvidenceOutput:
    """Validate raw extraction data into a MatchEvidenceOutput."""
    return _validate_contract(MatchEvidenceOutput, data)


def validate_evaluation_explanation(data: Any) -> EvaluationExplanationOutput:
    """Validate raw extraction data into an EvaluationExplanationOutput."""
    return _validate_contract(EvaluationExplanationOutput, data)
