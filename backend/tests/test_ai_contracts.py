"""Unit tests for the Phase 3.2 structured AI output contracts and validators."""

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.ai.contracts import (
    AI_CONTRACT_SCHEMA_VERSION,
    CandidateProfileExtractionOutput,
    EvaluationExplanationOutput,
    JobProfileExtractionOutput,
    MatchEvidenceOutput,
    validate_candidate_profile_extraction,
    validate_evaluation_explanation,
    validate_job_profile_extraction,
    validate_match_evidence,
)
from app.services.errors import ApplicationError, ValidationError


def _valid_job_profile() -> dict:
    return {"title": "Backend Engineer", "requirements": ["Python", "PostgreSQL"]}


def _valid_candidate_profile() -> dict:
    return {"full_name": "Ada Lovelace", "skills": ["Python", "SQL"]}


def _valid_match_evidence() -> dict:
    return {
        "evidence_type": "matched",
        "requirement_ref": {"requirement": "Python"},
        "candidate_evidence": {"text": "3 years Python"},
        "strength": "strong",
    }


def _valid_eval_explanation() -> dict:
    return {"summary": "Strong match on required skills."}


# --------------------------------------------------------------------------- #
# Valid contract construction
# --------------------------------------------------------------------------- #


def test_valid_job_profile_extraction_output() -> None:
    output = JobProfileExtractionOutput.model_validate(_valid_job_profile())
    assert output.title == "Backend Engineer"
    assert output.requirements == ["Python", "PostgreSQL"]
    assert output.schema_version == AI_CONTRACT_SCHEMA_VERSION


def test_valid_candidate_profile_extraction_output() -> None:
    output = CandidateProfileExtractionOutput.model_validate(_valid_candidate_profile())
    assert output.full_name == "Ada Lovelace"
    assert output.skills == ["Python", "SQL"]


def test_valid_match_evidence_output() -> None:
    output = MatchEvidenceOutput.model_validate(_valid_match_evidence())
    assert output.evidence_type == "matched"
    assert output.requirement_ref == {"requirement": "Python"}


def test_valid_evaluation_explanation_output() -> None:
    output = EvaluationExplanationOutput.model_validate(_valid_eval_explanation())
    assert output.summary == "Strong match on required skills."


# --------------------------------------------------------------------------- #
# Missing required fields
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "contract_type,data",
    [
        (JobProfileExtractionOutput, {"summary": "no title"}),
        (CandidateProfileExtractionOutput, {"skills": []}),
        (MatchEvidenceOutput, {"strength": "strong"}),
        (EvaluationExplanationOutput, {"points": []}),
    ],
)
def test_missing_required_field_rejected(contract_type, data) -> None:
    with pytest.raises(PydanticValidationError):
        contract_type.model_validate(data)


# --------------------------------------------------------------------------- #
# Wrong field types
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "contract_type,data",
    [
        (JobProfileExtractionOutput, {"title": 123}),
        (JobProfileExtractionOutput, {"title": "x", "requirements": [42]}),
        (CandidateProfileExtractionOutput, {"full_name": 123}),
        (CandidateProfileExtractionOutput, {"full_name": "x", "skills": [1]}),
        (MatchEvidenceOutput, {"evidence_type": "upgraded", "strength": 5}),
        (EvaluationExplanationOutput, {"summary": 123}),
        (EvaluationExplanationOutput, {"summary": "x", "points": [1]}),
    ],
)
def test_wrong_field_type_rejected(contract_type, data) -> None:
    with pytest.raises(PydanticValidationError):
        contract_type.model_validate(data)


# --------------------------------------------------------------------------- #
# Invalid contract values (domain-level)
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "contract_type,data",
    [
        (JobProfileExtractionOutput, {"title": ""}),
        (CandidateProfileExtractionOutput, {"full_name": ""}),
        (MatchEvidenceOutput, {"evidence_type": "other"}),
        (EvaluationExplanationOutput, {"summary": ""}),
    ],
)
def test_invalid_contract_rejected(contract_type, data) -> None:
    with pytest.raises(PydanticValidationError):
        contract_type.model_validate(data)


# --------------------------------------------------------------------------- #
# Optional fields / default behavior
# --------------------------------------------------------------------------- #


def test_optional_fields_default_when_omitted() -> None:
    job = JobProfileExtractionOutput.model_validate({"title": "Engineer"})
    assert job.summary is None
    assert job.requirements == []

    candidate = CandidateProfileExtractionOutput.model_validate({"full_name": "Ada"})
    assert candidate.summary is None
    assert candidate.skills == []
    assert candidate.experience == []

    evidence = MatchEvidenceOutput.model_validate({"evidence_type": "missing"})
    assert evidence.requirement_ref is None
    assert evidence.candidate_evidence is None
    assert evidence.strength is None
    assert evidence.provenance is None

    explanation = EvaluationExplanationOutput.model_validate({"summary": "ok"})
    assert explanation.points == []


def test_list_defaults_are_not_mutated_across_instances() -> None:
    first = JobProfileExtractionOutput.model_validate({"title": "Engineer"})
    first.requirements.append("Extra")
    second = JobProfileExtractionOutput.model_validate({"title": "Engineer"})
    assert second.requirements == []

    skill_first = CandidateProfileExtractionOutput.model_validate({"full_name": "Ada"})
    skill_first.skills.append("Python")
    skill_second = CandidateProfileExtractionOutput.model_validate({"full_name": "Ada"})
    assert skill_second.skills == []


def test_extra_fields_rejected() -> None:
    with pytest.raises(PydanticValidationError):
        JobProfileExtractionOutput.model_validate({"title": "X", "score": 90})


# --------------------------------------------------------------------------- #
# schema_version validation
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "contract_type,data",
    [
        (JobProfileExtractionOutput, {"title": "X", "schema_version": "9.9"}),
        (CandidateProfileExtractionOutput, {"full_name": "A", "schema_version": "9.9"}),
        (MatchEvidenceOutput, {"evidence_type": "matched", "schema_version": "9.9"}),
        (EvaluationExplanationOutput, {"summary": "x", "schema_version": "9.9"}),
        (JobProfileExtractionOutput, {"title": "X", "schema_version": "not-a-version"}),
        (JobProfileExtractionOutput, {"title": "X", "schema_version": ""}),
        (JobProfileExtractionOutput, {"title": "X", "schema_version": 5}),
    ],
)
def test_invalid_schema_version_rejected(contract_type, data) -> None:
    with pytest.raises(PydanticValidationError):
        contract_type.model_validate(data)


def test_supported_schema_version_accepted() -> None:
    output = JobProfileExtractionOutput.model_validate(
        {"title": "X", "schema_version": AI_CONTRACT_SCHEMA_VERSION}
    )
    assert output.schema_version == AI_CONTRACT_SCHEMA_VERSION


# --------------------------------------------------------------------------- #
# Validation helpers (raise the Phase 3.1 application ValidationError)
# --------------------------------------------------------------------------- #


def test_validators_return_validated_contracts() -> None:
    job = validate_job_profile_extraction(_valid_job_profile())
    assert isinstance(job, JobProfileExtractionOutput)

    candidate = validate_candidate_profile_extraction(_valid_candidate_profile())
    assert isinstance(candidate, CandidateProfileExtractionOutput)

    evidence = validate_match_evidence(_valid_match_evidence())
    assert isinstance(evidence, MatchEvidenceOutput)

    explanation = validate_evaluation_explanation(_valid_eval_explanation())
    assert isinstance(explanation, EvaluationExplanationOutput)


@pytest.mark.parametrize(
    "validator,data",
    [
        (validate_job_profile_extraction, {"summary": "missing title"}),
        (validate_candidate_profile_extraction, {"skills": []}),
        (validate_match_evidence, {"strength": "weak"}),
        (validate_evaluation_explanation, {"points": []}),
        (validate_job_profile_extraction, {"title": "X", "schema_version": "9.9"}),
    ],
)
def test_validators_raise_application_validation_error(validator, data) -> None:
    with pytest.raises(ValidationError) as excinfo:
        validator(data)
    assert isinstance(excinfo.value, ApplicationError)
    assert not isinstance(excinfo.value, PydanticValidationError)


def test_validator_validation_error_is_not_a_raw_pydantic_error() -> None:
    try:
        validate_job_profile_extraction({"summary": "missing title"})
    except ValidationError:
        pass
    else:
        raise AssertionError("expected ApplicationError to be raised")
