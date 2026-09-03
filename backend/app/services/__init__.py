"""Application services.

Phase 3.1 deterministic service foundation: versioned profiles, evaluations,
workflow tracing, and the typed error hierarchy. Phase 4.3 adds focused
CRUD services for API-layer resource management. Services accept a caller-owned
SQLAlchemy Session; they add/flush/query but never commit.
"""

from app.services.candidate_profile_service import CandidateProfileService
from app.services.candidate_service import CandidateService
from app.services.decision_service import VALID_DECISIONS, DecisionService
from app.services.errors import (
    ApplicationError,
    InvalidStateError,
    NotFoundError,
    ValidationError,
    VersionConflictError,
)
from app.services.evaluation_service import EvaluationService
from app.services.job_application_service import JobApplicationService
from app.services.job_profile_service import JobProfileService
from app.services.job_service import JobService
from app.services.observability_service import (
    AIFailureSummary,
    ObservabilityService,
    WorkflowRunSummary,
)
from app.services.organization_service import OrganizationService
from app.services.resume_service import ResumeService
from app.services.user_service import UserService
from app.services.workflow_trace_service import WorkflowTraceService

__all__ = [
    "AIFailureSummary",
    "ApplicationError",
    "CandidateProfileService",
    "CandidateService",
    "DecisionService",
    "EvaluationService",
    "InvalidStateError",
    "JobApplicationService",
    "JobProfileService",
    "JobService",
    "NotFoundError",
    "ObservabilityService",
    "OrganizationService",
    "ResumeService",
    "UserService",
    "VALID_DECISIONS",
    "ValidationError",
    "VersionConflictError",
    "WorkflowRunSummary",
    "WorkflowTraceService",
]
