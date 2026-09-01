# AI Contract Schema

This document describes the Phase 3.2 structured AI output contract package and
its schema-versioning boundary. It is intentionally short: it does not rewrite
the architecture or product documentation.

## Location

- Package: `backend/app/ai/contracts/`
- Maps to the AI application layer described in `docs/architecture.md`.
- Contracts are plain Pydantic models: no SQLAlchemy, no database behavior, and
  no HR final decision fields.

## Schema Versioning

The initial contract schema version is `1.0` (`AI_CONTRACT_SCHEMA_VERSION`).
Every contract carries a `schema_version` field that:

- defaults to the current supported version,
- must be a non-empty string, and
- must be one of the supported versions (`SUPPORTED_SCHEMA_VERSIONS`).

This lets a producer signal which contract revision it conformed to and lets a
consumer reject unrecognized revisions before processing.

## Contracts

| Contract | Produced on | Structured fields |
| --- | --- | --- |
| `JobProfileExtractionOutput` | job profile extraction | `title`, `summary?`, `requirements[]` |
| `CandidateProfileExtractionOutput` | candidate profile extraction | `full_name`, `summary?`, `skills[]`, `experience[]` |
| `MatchEvidenceOutput` | matching evidence | `evidence_type` (`matched`/`missing`/`partial`), `requirement_ref?`, `candidate_evidence?`, `strength?`, `provenance?` |
| `EvaluationExplanationOutput` | evaluation explanation | `summary`, `points[]` |

All contracts reject undeclared ("extra") fields.

## Validation Boundary

Validation helpers in `app/ai/contracts/validation.py`:

- accept structured Python data,
- validate through Pydantic,
- return the validated contract, and
- translate Pydantic validation failures into the shared Phase 3.1
  `app.services.errors.ValidationError`.

They never persist anything and never call an external provider.

## Deliberately Undefined

The following are intentionally not specified because the repository does not
yet define enough information to safely finalize them:

- A nested `JobRequirement` structure (requirements are currently a flat list of
  strings). A structured requirement vocabulary may be added when the matching
  and scoring contracts are specified.
- A nested candidate experience/skill entry model (experience is a flat list of
  strings).
- Match evidence `requirement_ref`, `candidate_evidence`, and `provenance` are
  free-form `dict` payloads mirroring the JSONB columns of the `MatchEvidence`
  model; their internal key vocabulary is not yet part of a contract.
- **Decisions and scores**: `MatchEvidenceOutput` is evidence only and
  `EvaluationExplanationOutput` is explanatory only. Neither contains a final
  score, an HR decision, a recommendation that implies a decision, or any
  authorization outcome. HR remains the final decision maker.
